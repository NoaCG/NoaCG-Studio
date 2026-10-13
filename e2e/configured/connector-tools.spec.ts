// covers: api/_lib/me/connectorTools.ts, api/_lib/me/mcp.ts, src/templates/catalogIndex.ts, src/templates/catalogIndexBuild.ts
// covers: scripts/catalogIndexPlugin.mjs, src/entitlements/permissions.ts
//
// THE REMOTE MCP CONNECTOR'S READ TOOLS, on the runner's local stack (docs/REMOTE_MCP_PLAN.md,
// AC-3). Two throwaway accounts, A and B, each connect a scripted chat client
// (@modelcontextprotocol/sdk) through the real OAuth flow: dynamic registration, the authorization
// URL, Allow through NoaCG's own consent endpoint with the account's session (the consent PAGE is
// connector-grants.spec.ts), the code for a token. A belongs to a team; B owns another.
//
//   tools/list     the read tools, each with a title and all three hints
//   noacg_catalog  finds designs by category and by words from the index the dev server serves
//   noacg_library  A gets A's graphics, brand and productions and A's team's production, B gets
//                  B's, neither gets the other's or the other team's, and no template source
//                  ever leaves; one production comes back with its graphics and cues
//
// Local stack only: it registers OAuth clients, which hosted staging's Auth cannot do yet.

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { isConnectorTestStack } from '../../scripts/connector-oauth-spike.mjs';
import { mintAccount, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import { callTool, deleteOAuthClient, ScriptedClaude, signedInClient } from './_connector';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
/** Written into every template's code; it must never come back from a tool. */
const SOURCE = `TEMPLATE-SOURCE-${randomBytes(6).toString('hex')}`;

interface Seeded {
  graphic: string;
  brand: string;
  production: string;
  teamProduction: string;
}

const now = () => new Date().toISOString();
const template = (name: string) => ({
  name,
  type: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  fps: 50,
  html: `<div class="graphic-box">${SOURCE}</div>`,
  css: `/* ${SOURCE} */`,
  js: `// ${SOURCE}`,
  fields: [
    { field: 'f0', ftype: 'textfield', title: 'Name', value: 'Anna Andersson' },
    { field: 'f1', ftype: 'textfield', title: 'Title', value: 'Pastor' },
  ],
  settings: {},
  assets: [{ path: 'images/logo.png', data: `data:image/png;base64,${SOURCE}` }],
  layers: [],
});
const show = (id: string, name: string, graphicId: string, brandId?: string) => ({
  id,
  name,
  version: 2,
  ...(brandId ? { brandId } : {}),
  graphics: [{ id: 'pool-1', name: `${name} names`, type: 'lower-third', savedAt: now(), template: template('Names'), graphicId, layer: 20 }],
  cues: [{ id: 'cue-1', sourceId: 'pool-1', label: 'Pastor Lee', values: { f0: 'Lee', f1: 'Pastor' } }],
});

/** One account's library, a team it owns, and that team's production - all through the service
 *  role, the way the studio's sync and team saves leave them. */
async function seed(admin: SupabaseClient, userId: string, label: string): Promise<Seeded> {
  const graphic = randomUUID();
  const brand = randomUUID();
  const production = randomUUID();
  const teamProduction = randomUUID();
  const docs = [
    {
      id: graphic,
      user_id: userId,
      kind: 'graphic',
      name: `${label} names`,
      body: { version: 1, id: graphic, name: `${label} names`, type: 'lower-third', packageId: null, template: template(`${label} names`), entries: [], activeEntryId: null, createdAt: now(), updatedAt: now(), folder: `${label} folder` },
    },
    {
      id: brand,
      user_id: userId,
      kind: 'look',
      name: `${label} brand`,
      body: { id: brand, name: `${label} brand`, updatedAt: now(), brand: { styleTag: 'minimal', palette: { id: 'custom', name: `${label} blue`, styleTags: ['minimal'], accent: '#1d4ed8', text: '#ffffff', textDim: '#cbd5e1', panel: '#0b1220' }, fontId: 'inter', customFont: null } },
    },
    { id: production, user_id: userId, kind: 'show', name: `${label} service`, body: show(production, `${label} service`, graphic, brand) },
  ];
  const inserted = await admin.from('documents').insert(docs.map((d) => ({ ...d, deleted: false })));
  if (inserted.error) throw new Error(`documents: ${inserted.error.message}`);
  const team = await admin.from('teams').insert({ name: `${label} team`, owner_id: userId }).select('id').single();
  if (team.error) throw new Error(`teams: ${team.error.message}`);
  const member = await admin.from('team_members').insert({ team_id: team.data.id, user_id: userId, display_name: label, role: 'owner' });
  if (member.error) throw new Error(`team_members: ${member.error.message}`);
  const shared = await admin.from('team_productions').insert({ id: teamProduction, team_id: team.data.id, doc: show(teamProduction, `${label} team night`, graphic), updated_by: userId });
  if (shared.error) throw new Error(`team_productions: ${shared.error.message}`);
  return { graphic, brand, production, teamProduction };
}

const call = callTool;
const idsOf = (list: unknown) => (list as Array<{ id: string }>).map((x) => x.id);

test.describe('remote MCP connector: the read tools', () => {
  test.setTimeout(150_000);

  test('a chat client finds catalog designs and reads its own user\'s library, never another account\'s', async ({ request, baseURL }) => {
    test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
    test.skip(!isConnectorTestStack(SUPABASE_URL), 'local stack or a named preview branch only: it registers OAuth clients');
    const origin = baseURL!.replace(/\/+$/, '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const stamp = Date.now();
    const accounts = ['a', 'b'].map((who) => ({ who, email: `connector-tools-${who}-${stamp}@noacg.local`, password: `pw-${randomBytes(9).toString('base64url')}`, provider: new ScriptedClaude(`Claude (scripted ${who.toUpperCase()})`) }));
    const userIds: string[] = [];

    try {
      for (const account of accounts) userIds.push(await mintAccount(admin, account.email, account.password));
      const [seededA, seededB] = [await seed(admin, userIds[0], 'A'), await seed(admin, userIds[1], 'B')];
      const [clientA, clientB] = [
        await signedInClient(request, origin, { url: SUPABASE_URL, anonKey: ANON_KEY }, accounts[0].email, accounts[0].password, accounts[0].provider),
        await signedInClient(request, origin, { url: SUPABASE_URL, anonKey: ANON_KEY }, accounts[1].email, accounts[1].password, accounts[1].provider),
      ];

      // tools/list: the read tools, each titled and with all three hints.
      const { tools } = await clientA.listTools();
      expect(tools.map((t) => t.name)).toEqual(['noacg_catalog', 'noacg_library', 'noacg_send_package']);
      for (const tool of tools.filter((t) => t.name !== 'noacg_send_package')) {
        expect(tool.title, tool.name).toBeTruthy();
        expect(tool.annotations, tool.name).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      }
      console.log(`connector tools: tools/list is ${JSON.stringify(tools).length} characters for ${tools.length} tools`);

      // noacg_catalog: the static index the dev server serves, searched by category and by words.
      const served = await request.get(`${origin}/catalog-index.json`);
      expect(served.status()).toBe(200);
      const index = (await served.json()) as { types: Array<{ id: string }> };
      expect(index.types.length).toBeGreaterThan(10);
      const byCategory = await call(clientA, 'noacg_catalog', { category: 'scoreboard' });
      expect(byCategory.isError).not.toBe(true);
      const boards = byCategory.structuredContent!.types as Array<{ id: string; category: string; fields: Array<{ key: string }>; designs: Array<{ id: string; palette: string; font: string }> }>;
      expect(boards.length).toBeGreaterThan(0);
      expect(boards.every((t) => t.category === 'scoreboard')).toBe(true);
      const byWords = await call(clientA, 'noacg_catalog', { query: 'lower third name title' });
      const found = byWords.structuredContent!.types as typeof boards;
      expect(found[0].id).toBe('lower-third');
      expect(found[0].fields.map((f) => f.key)).toEqual(expect.arrayContaining(['name', 'title']));
      expect(found[0].designs.length).toBeGreaterThan(0);
      const palettes = byWords.structuredContent!.palettes as Array<{ id: string }>;
      const fonts = byWords.structuredContent!.fonts as Array<{ id: string }>;
      expect(idsOf(palettes)).toContain(found[0].designs[0].palette);
      expect(idsOf(fonts)).toContain(found[0].designs[0].font);
      console.log(`connector tools: catalog has ${index.types.length} types; "scoreboard" found ${boards.length}, the words found ${found.map((t) => t.id).slice(0, 3).join(', ')} first`);

      // noacg_library, as each account: its own and its team's, never the other's, never code.
      const views: Array<Record<string, unknown>> = [];
      for (const [client, own, other] of [[clientA, seededA, seededB], [clientB, seededB, seededA]] as const) {
        const answer = await call(client, 'noacg_library');
        expect(answer.isError, answer.content[0]?.text).not.toBe(true);
        const view = answer.structuredContent!;
        views.push(view);
        expect(answer.content[0].text).not.toContain(SOURCE);
        expect(idsOf(view.graphics)).toEqual([own.graphic]);
        expect(idsOf(view.brands)).toEqual([own.brand]);
        expect(idsOf(view.productions).sort()).toEqual([own.production, own.teamProduction].sort());
        for (const id of Object.values(other)) expect(answer.content[0].text).not.toContain(id);
      }
      const graphicA = (views[0].graphics as Array<{ name: string; fields: Array<{ id: string; title: string }> }>)[0];
      expect(graphicA.fields.map((f) => f.title)).toEqual(['Name', 'Title']);
      expect((views[0].productions as Array<{ id: string; team?: string }>).find((p) => p.id === seededA.teamProduction)?.team).toBe('A team');

      // One production: the team's, with its graphics and cues; another account's is not there.
      const detail = await call(clientA, 'noacg_library', { production: seededA.teamProduction });
      expect(detail.isError).not.toBe(true);
      expect(detail.content[0].text).not.toContain(SOURCE);
      expect(detail.structuredContent!.production).toMatchObject({
        id: seededA.teamProduction,
        team: 'A team',
        graphics: [{ id: 'pool-1', graphicId: seededA.graphic, layer: 20 }],
        cues: [{ label: 'Pastor Lee', graphic: 'A team night names', values: { f0: 'Lee', f1: 'Pastor' } }],
      });
      for (const id of [seededB.production, seededB.teamProduction]) {
        const refused = await call(clientA, 'noacg_library', { production: id });
        expect(refused.isError, id).toBe(true);
      }
      console.log('connector tools: A and B each read only their own graphics, brands, productions and team production; no template source in any answer');
    } finally {
      for (const { provider } of accounts) await deleteOAuthClient(SUPABASE_URL, SERVICE_ROLE_KEY, provider.info?.client_id);
      for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });
});
