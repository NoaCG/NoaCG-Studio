// The community publish/import gate (Era 5.5) - now the platform's ONE publish gate, living in
// src/validation/publishGate.ts since it also guards the library->air boundary (hosted publish,
// production export - docs/AGENT_SAVE.md). Re-exported here so its older callers keep their import
// path: CommunityGallery's importer and src/bridge/bridgeApi.ts. The doctrine - strict,
// deterministic, unsafe-JS findings are ERRORS - is documented where the function now lives.

export { publishGate } from '../validation/publishGate';
