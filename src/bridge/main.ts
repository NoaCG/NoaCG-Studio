// The /bridge page entry (bridge.html) - vanilla TS, no React, the /ograf pattern.
//
// It installs the bridge API on `window.noacgBridge` and says so in the page. A headless driver
// (the `noacg` CLI / MCP server, docs/AGENT_CLI.md) waits for `window.__noacgBridgeReady`, calls
// `hello()` to check the protocol version, then drives the functions through `page.evaluate`.
// The page is `noindex` and out of the sitemap: it is a tool surface, not a destination.
// Ready means callable: the type registry is not in the first payload, and starts loading only
// after the ready flag is set (bridgeApi.ts), so `types()` and `scaffold()` wait for it at most.

import { bridgeApi, BRIDGE_V, loadTypeRegistry, type BridgeApi } from './bridgeApi';

declare global {
  interface Window {
    noacgBridge?: BridgeApi;
    __noacgBridgeReady?: boolean;
  }
}

window.noacgBridge = bridgeApi;
window.__noacgBridgeReady = true;

const status = document.getElementById('status');
if (status) status.textContent = `Bridge v${BRIDGE_V} ready.`;
// A failure here is reported by the call that needs the registry, not by the page.
loadTypeRegistry().catch(() => {});
