import { serverAddress } from '../control/playoutLink';
import type { RememberedServer } from '../control/playoutProtocol';

/**
 * The CasparCG servers NoaCG Bridge remembers this studio connecting to, most recent first, as one
 * button each (docs/work-specs/bridge-casparcg-connect). A server is a host AND a port, so it is
 * picked whole with one press rather than suggested for the address box alone. Used by the pairing
 * page's connect step and by Playout settings, where a press connects to that server.
 */
export default function RecentServers({
  servers,
  onPick,
  disabled,
  testId,
}: {
  servers: RememberedServer[];
  onPick: (server: RememberedServer) => void;
  disabled?: boolean;
  testId: string;
}) {
  if (servers.length === 0) return null;
  return (
    <div className="recent-servers" data-testid={testId}>
      <span className="hint">Used before:</span>
      {servers.map((server) => (
        <button key={`${server.host}:${server.port}`} onClick={() => onPick(server)} disabled={disabled}>
          {serverAddress(server)}
        </button>
      ))}
    </div>
  );
}
