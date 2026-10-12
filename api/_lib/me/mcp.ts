// THE REMOTE MCP CONNECTOR's endpoint (docs/REMOTE_MCP_PLAN.md, key decision 1): `POST /mcp` and
// its protected resource metadata at `/.well-known/oauth-protected-resource/mcp`, both rewritten
// by vercel.json into the api/me catch-all, so they cost no function slot.
//
//   POST /mcp                                       connector token -> a JSON-RPC answer
//                                                   anything else   -> 401 + WWW-Authenticate
//   GET|DELETE /mcp                                 405 (no sessions, no server stream)
//   GET /.well-known/oauth-protected-resource/mcp   RFC 9728 metadata naming Supabase Auth
//   any of them, while Auth runs no OAuth server    503 connector_disabled
//
// STATELESS STREAMABLE HTTP, BOTH ERAS. A request carrying the 2026-07-28 per-request metadata
// (`_meta["io.modelcontextprotocol/protocolVersion"]`) is served by that revision, headers checked
// against the body; an `initialize` selects a 2025-era revision, which Claude's connector docs still
// describe. Either way the server keeps no session: every POST is resolved on its own, which is
// what a serverless function can promise.
//
// WHO MAY CALL: only a CONNECTOR principal - a chat client's OAuth token whose user holds a live
// `connector_grants` row for that client (api/_lib/principal.ts, migration 0090). A session or an
// agent key is not a connector and is answered 401 like no token at all, so a chat client is
// always sent to sign in rather than served as somebody's full session. The token itself never
// travels further: PostgREST refuses it (migration 0089), so a tool reads and writes with the
// service role and the principal's user id.
//
// THE AUDIENCE CHECK (MCP 2026-07-28 requires one). Supabase Auth issues `aud: authenticated`, not
// this resource, and its scopes are identity-only. The binding is the grant row instead: a token
// is admitted only for the exact client the user approved on NoaCG's own consent page, and only
// while that row is live. A token minted for any other client of the same Auth project is
// anonymous here.
//
// THE TOOLS: the read tools (noacg_catalog, noacg_library) live in connectorTools.ts; phase 4 adds
// noacg_send_package. Each names the permission it needs, and `tools/call` asks `permits()`
// before running one.

import { bearerToken, json, readJson } from '../http.js';
import { authServerUrl, connectorEnabled } from '../connectorAuth.js';
import { checkConnectorRateLimit } from '../rateLimit.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { permits, type PermissionKey, type Principal } from '../../../src/entitlements/permissions.js';
import { createReadTools } from './connectorTools.js';

export const MCP_PATH = '/mcp';
export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource/mcp';

/** The per-request-metadata revision, and the `initialize` revisions still answered. */
export const MODERN_VERSIONS = ['2026-07-28'] as const;
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
const SUPPORTED_VERSIONS: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

const SERVER_INFO = { name: 'noacg', title: 'NoaCG Studio', version: '1.0.0' };
const CAPABILITIES = { tools: { listChanged: false } };
/** What a 2025-era client hands its model about this server beside the tools. Costs no schema. */
const INSTRUCTIONS =
  "NoaCG Studio makes broadcast graphics. Find ready-made designs with noacg_catalog, and the user's own graphics, brands and productions with noacg_library.";
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';

/** Comfortably above any tool call the connector takes; a package is recipes and ids, not code. */
const MAX_BODY_BYTES = 1_000_000;

/** The scopes a client asks Supabase Auth for: identity only, the only kind Auth issues. */
export const CONNECTOR_SCOPES = ['openid', 'email'];

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  /** What the principal must be permitted; null for public data. */
  permission: PermissionKey | null;
  call(principal: Principal, args: Record<string, unknown>, ctx: McpToolContext): Promise<McpToolResult>;
}

export interface McpToolContext {
  /** This deployment's origin, where its static files (the catalog index) are served. */
  origin: string;
}

/** The connector's tools. */
export const TOOLS: readonly McpTool[] = createReadTools();

export interface McpDeps extends PrincipalDeps {
  enabled?: () => Promise<boolean>;
  tools?: readonly McpTool[];
}

type Id = string | number | null;
interface RpcRequest {
  jsonrpc?: unknown;
  id?: Id;
  method?: unknown;
  params?: Record<string, unknown> & { _meta?: Record<string, unknown> };
}

const rpcResult = (id: Id, result: unknown, status = 200): Response => json({ jsonrpc: '2.0', id, result }, status);
const rpcError = (id: Id, code: number, message: string, status = 200, data?: unknown): Response =>
  json({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);

/** The connector is off on this deployment: one answer for every connector path. */
export const connectorDisabled = (): Response =>
  json(
    { error: { code: 'connector_disabled', message: 'The NoaCG connector is not turned on for this deployment.' } },
    503,
  );

/** The resource a client typed, and the metadata URL a 401 points at, from the request's origin. */
function resourceUrls(req: Request): { origin: string; resource: string; metadata: string } {
  const origin = new URL(req.url).origin;
  return { origin, resource: `${origin}${MCP_PATH}`, metadata: `${origin}${PROTECTED_RESOURCE_PATH}` };
}

/** `Mcp-Name` may carry `=?base64?…?=` for a value that is not plain ASCII. */
function headerValue(raw: string | null): string | null {
  if (raw === null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(raw);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : raw;
}

function toolView(tool: McpTool) {
  return { name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations };
}

export function createMcpHandler(deps: McpDeps = {}): { fetch(req: Request): Promise<Response> } {
  const enabled = deps.enabled ?? (() => connectorEnabled());
  const tools = deps.tools ?? TOOLS;

  async function callTool(id: Id, principal: Principal, params: RpcRequest['params'], ctx: McpToolContext, done: (result: object) => Response): Promise<Response> {
    const name = typeof params?.name === 'string' ? params.name : '';
    const tool = tools.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${name || '(none)'}`);
    if (tool.permission && !permits(principal, tool.permission)) {
      return done({ isError: true, content: [{ type: 'text', text: 'This connector is not allowed to do that. The user can review it in NoaCG Settings → Account → Agent access.' }] });
    }
    const args = params?.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
    try {
      return done(await tool.call(principal, args, ctx));
    } catch {
      // A tool's own failure is a result the model can report, not a broken transport.
      return done({ isError: true, content: [{ type: 'text', text: `${tool.title} failed on the NoaCG side. Try again in a moment.` }] });
    }
  }

  async function answer(req: Request, principal: Principal, msg: RpcRequest): Promise<Response> {
    const id: Id = msg.id ?? null;
    const method = typeof msg.method === 'string' ? msg.method : '';
    const headerVersion = req.headers.get('mcp-protocol-version');
    const bodyVersion = msg.params?._meta?.[META_VERSION];

    if (typeof bodyVersion === 'string') {
      // 2026-07-28: the headers mirror the body, and a mismatch is refused before anything runs.
      const mismatch =
        headerVersion !== bodyVersion ? 'MCP-Protocol-Version'
        : req.headers.get('mcp-method') !== method ? 'Mcp-Method'
        : method === 'tools/call' && headerValue(req.headers.get('mcp-name')) !== msg.params?.name ? 'Mcp-Name'
        : null;
      if (mismatch) return rpcError(id, -32020, `Header mismatch: ${mismatch} is missing or does not match the body`, 400);
      if (!(MODERN_VERSIONS as readonly string[]).includes(bodyVersion)) {
        return rpcError(id, -32022, 'Unsupported protocol version', 400, { supported: SUPPORTED_VERSIONS, requested: bodyVersion });
      }
      if (method === 'server/discover') {
        return rpcResult(id, {
          resultType: 'complete',
          supportedVersions: SUPPORTED_VERSIONS,
          capabilities: CAPABILITIES,
          _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
        });
      }
    } else {
      // The 2025 revisions: `initialize` negotiates, and later requests name it in the header.
      if (headerVersion && !(LEGACY_VERSIONS as readonly string[]).includes(headerVersion) && method !== 'initialize') {
        return (MODERN_VERSIONS as readonly string[]).includes(headerVersion)
          ? rpcError(id, -32020, `Header mismatch: the body carries no ${META_VERSION}`, 400)
          : rpcError(id, -32600, `Unsupported protocol version: ${headerVersion}`, 400);
      }
      if (method === 'initialize') {
        const asked = msg.params?.protocolVersion;
        const protocolVersion = typeof asked === 'string' && (LEGACY_VERSIONS as readonly string[]).includes(asked) ? asked : LEGACY_VERSIONS[0];
        return rpcResult(id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
    }

    // The methods both eras share; 2026-07-28 marks every result complete.
    const modern = typeof bodyVersion === 'string';
    const done = (result: object) => rpcResult(id, modern ? { resultType: 'complete', ...result } : result);
    if (method === 'tools/list') return done({ tools: tools.map(toolView) });
    if (method === 'tools/call') return callTool(id, principal, msg.params, { origin: resourceUrls(req).origin }, done);
    if (method === 'ping') return done({});
    // A modern server answers an unknown method with 404, so a client can tell it from a legacy one.
    return rpcError(id, -32601, `Method not found: ${method}`, modern ? 404 : 200);
  }

  async function post(req: Request): Promise<Response> {
    const urls = resourceUrls(req);
    // DNS-rebinding guard (Streamable HTTP): a browser page from another origin is refused. A chat
    // client calls from its own servers and sends no Origin.
    const origin = req.headers.get('origin');
    if (origin && origin !== urls.origin) return rpcError(null, -32600, 'Origin not allowed', 403);
    const limited = checkConnectorRateLimit(req);
    if (limited) return rpcError(null, -32000, 'Too many requests - slow down.', 429);

    const principal = await resolvePrincipal(req, { ...deps, connector: true });
    if (principal.kind !== 'connector') {
      const presented = bearerToken(req) ? ', error="invalid_token"' : '';
      return json(
        { error: { code: 'unauthorized', message: 'Sign in to NoaCG to use this connector.' } },
        401,
        { 'www-authenticate': `Bearer resource_metadata="${urls.metadata}"${presented}` },
      );
    }

    let msg: unknown;
    try {
      msg = await readJson<unknown>(req, MAX_BODY_BYTES);
    } catch (e) {
      return (e as { code?: string }).code === 'too_large'
        ? rpcError(null, -32600, 'Request too large', 413)
        : rpcError(null, -32700, 'Parse error', 400);
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || (msg as RpcRequest).jsonrpc !== '2.0') {
      return rpcError(null, -32600, 'Invalid request: one JSON-RPC 2.0 message per POST', 400);
    }
    const rpc = msg as RpcRequest;
    // A notification (no id) asks nothing; a response from a client has no place here.
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    return answer(req, principal, rpc);
  }

  return {
    async fetch(req) {
      if (!(await enabled())) return connectorDisabled();
      if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      return post(req);
    },
  };
}

/** RFC 9728 metadata for the MCP endpoint: which authorization server signs its users in. */
export function createProtectedResourceHandler(deps: Pick<McpDeps, 'enabled'> = {}): { fetch(req: Request): Promise<Response> } {
  const enabled = deps.enabled ?? (() => connectorEnabled());
  return {
    async fetch(req) {
      const issuer = authServerUrl();
      if (!issuer || !(await enabled())) return connectorDisabled();
      if (req.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      const { resource } = resourceUrls(req);
      return json(
        {
          resource,
          authorization_servers: [issuer],
          scopes_supported: CONNECTOR_SCOPES,
          bearer_methods_supported: ['header'],
          resource_name: 'NoaCG Studio',
        },
        200,
        { 'access-control-allow-origin': '*' },
      );
    },
  };
}

export default createMcpHandler();
export const protectedResource = createProtectedResourceHandler();
