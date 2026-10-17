// The one rule for whether Supabase Auth's OAuth discovery document means the connector is on.
// The site (connectorAuth.ts) and the owner's switch (scripts/connector-switch.mjs) both read it
// from here, so the switch can never call a project on while a deployment reads it off (#1115).
//
// No imports and only erasable type syntax: the switch loads this file under plain Node, which
// strips the types, so it must not depend on the compiled api/ build.

/** The parts of a discovery document the connector relies on. */
export interface ConnectorDiscovery {
  issuer: string;
  registration_endpoint: string;
  jwks_uri?: unknown;
}

/** On when the document names a string `issuer` and a non-empty `registration_endpoint`: dynamic
 *  registration is what a chat client needs, so an OAuth server without it counts as off. */
export function isConnectorDiscovery(doc: unknown): doc is ConnectorDiscovery {
  if (typeof doc !== 'object' || doc === null) return false;
  const { issuer, registration_endpoint: registration } = doc as { issuer?: unknown; registration_endpoint?: unknown };
  return typeof registration === 'string' && registration !== '' && typeof issuer === 'string';
}
