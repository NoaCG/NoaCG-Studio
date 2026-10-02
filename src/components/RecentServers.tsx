import { PLAYOUT_DEFAULTS, serverAddress } from '../control/playoutLink';
import type { RememberedServer } from '../control/playoutProtocol';
import { sameServer } from '../control/studioSetup';

/** CasparCG on the computer the Bridge runs on, on its own port: the one server every studio can name
 *  without looking anything up. */
export const THIS_COMPUTER: RememberedServer = { host: '127.0.0.1', port: PLAYOUT_DEFAULTS.amcpPort };

/**
 * The servers to pick from with one press: "This computer", then the CasparCG servers NoaCG Bridge
 * remembers this studio connecting to, most recent first (docs/work-specs/bridge-casparcg-connect,
 * studio-day-playout D8). A server is a host AND a port, so it is picked whole rather than suggested
 * for the address box alone. The one in use is marked. Used by the pairing page's server step and by
 * Playout settings, where a press connects to that server.
 */
export default function RecentServers({
  servers,
  onPick,
  disabled,
  current,
  testId,
}: {
  servers: RememberedServer[];
  onPick: (server: RememberedServer) => void;
  disabled?: boolean;
  /** The server connected to, marked among the others. */
  current?: RememberedServer | null;
  testId: string;
}) {
  const before = servers.filter((s) => !sameServer(s, THIS_COMPUTER));
  const button = (server: RememberedServer, label: string, title: string) => {
    const inUse = !!current && sameServer(server, current);
    return (
      <button
        key={`${server.host}:${server.port}`}
        onClick={() => onPick(server)}
        disabled={disabled}
        aria-current={inUse ? 'true' : undefined}
        className={inUse ? 'active' : undefined}
        title={title}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="recent-servers" data-testid={testId}>
      {button(THIS_COMPUTER, 'This computer', `CasparCG on this computer, ${serverAddress(THIS_COMPUTER)}`)}
      {before.length > 0 && <span className="hint">Used before:</span>}
      {before.map((server) => button(server, serverAddress(server), `Connect to ${serverAddress(server)}`))}
    </div>
  );
}
