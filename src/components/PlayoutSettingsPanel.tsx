import { useEffect, useState } from 'react';
import { MAX_PLAYOUT_CHANNEL, MIN_PLAYOUT_CHANNEL } from '../model/shows';
import {
  channelLabel,
  connectServer,
  defaultChannelName,
  loadPlayoutSettings,
  playoutConfigured,
  putOutputOnAir,
  rememberedServers,
  savePlayoutSettings,
  serverAddress,
  slotAddress,
  slotOf,
  testConnection,
  type PlayoutChannel,
  type PlayoutResult,
  type PlayoutSettings,
} from '../control/playoutLink';
import type { RememberedServer } from '../control/playoutProtocol';

/** The panel's three presses. */
type Verb = 'test' | 'connect' | 'air';
import { DOWNLOADS_BRIDGE_URL } from '../downloads/links';

/**
 * "Playout" - the one playout server this studio drives, through NoaCG Bridge (docs/BRIDGE.md).
 * App-wide and persisted, never per production: a studio has one playout box, and retyping it
 * per show is the friction this removes. NoaCG owns these settings; the Bridge is told its
 * target on every call, and keeps only the servers the page CONNECTED to, so it can hand them back
 * to a browser that forgot (control/playoutLink.ts `rememberedServers`).
 *
 * FEATURE-DETECTED, not gated. With no Bridge running the section is complete and explains what
 * to run - it must never look broken, because the CasparCG routes in
 * docs/PLAYOUT_INTEGRATION.md all still work without any of this.
 *
 * The diagnosis states come from control/playoutLink.ts and are shown as themselves. A single
 * generic red here would be the worst possible outcome: "the browser has not been given local
 * network permission", "the Bridge is not running", "the Bridge rejected the token" and "the
 * server did not answer" have nothing to do with each other, and most of them are the person's
 * own to fix.
 */
export default function PlayoutSettingsPanel({ outputUrl }: { outputUrl?: string | null } = {}) {
  const [settings, setSettings] = useState(loadPlayoutSettings);
  const [busy, setBusy] = useState<Verb | null>(null);
  // WHICH button produced the verdict and, for Put on air, the address it went to: the sentence
  // is past tense, so it must not be re-derived from settings typed since (ProductionLinks.tsx,
  // BridgeAirRow, says what that cost once).
  const [result, setResult] = useState<{ verb: Verb; result: PlayoutResult; address?: string } | null>(null);
  // The servers NoaCG Bridge remembers this studio connecting to, offered on the host field.
  const [servers, setServers] = useState<RememberedServer[]>([]);
  const paired = Boolean(settings.agentToken.trim());
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    void rememberedServers(loadPlayoutSettings()).then((list) => {
      if (alive) setServers(list);
    });
    return () => {
      alive = false;
    };
  }, [paired]);

  const set = (patch: Partial<PlayoutSettings>) => {
    savePlayoutSettings(patch);
    setSettings(loadPlayoutSettings());
    setResult(null); // a changed setting makes the last verdict stale, and a stale tick lies
  };

  const run = async (verb: Verb) => {
    // Read at the moment of the press, like every other door that sends: the form saves as it is
    // typed, and a copy latched earlier would name the old server.
    const now = loadPlayoutSettings();
    setBusy(verb);
    setResult(null);
    try {
      if (verb === 'test') {
        setResult({ verb, result: await testConnection(now) });
      } else if (verb === 'connect') {
        const connected = await connectServer(now);
        if (connected.servers) setServers(connected.servers);
        setResult({ verb, result: connected.result });
      } else if (outputUrl) {
        setResult({ verb, result: await putOutputOnAir(now, outputUrl), address: `${slotAddress(slotOf(now))} of ${serverAddress({ host: now.host, port: now.amcpPort })}` });
      }
    } finally {
      setBusy(null);
    }
  };

  const configured = playoutConfigured(settings);

  // ── The channel table. A row's NUMBER is what the defaults point at, so renumbering the
  //    graphics or clip channel carries its default along rather than leaving it pointing at a
  //    number no row names any more. ──
  const setRow = (index: number, patch: Partial<PlayoutChannel>) => {
    const was = settings.channels[index].channel;
    const moved = patch.channel !== undefined && patch.channel !== was;
    // A row still wearing its starting name (`Channel 3`) is renamed with its number, so a
    // renumbered row never reads `Channel 3` on channel 4. A name the operator typed stays.
    const renamed =
      moved && settings.channels[index].name === defaultChannelName(was) ? { name: defaultChannelName(patch.channel!) } : {};
    const channels = settings.channels.map((row, i) => (i === index ? { ...row, ...patch, ...renamed } : row));
    set({
      channels,
      ...(moved && settings.channel === was ? { channel: patch.channel } : {}),
      ...(moved && settings.clipChannel === was ? { clipChannel: patch.channel } : {}),
    });
  };
  /** The next number up, named by its number like every new row. While clips still share the
   *  graphics channel, the new row also becomes the clip default: a studio adds a second
   *  channel to put something else on it, and a stock single-channel studio never has a clip
   *  aimed at a channel it lacks. Both picks stay one select away below. */
  const highestChannel = Math.max(...settings.channels.map((row) => row.channel));
  const addRow = () => {
    const next = Math.min(MAX_PLAYOUT_CHANNEL, highestChannel + 1);
    const firstExtra = settings.clipChannel === settings.channel;
    set({
      channels: [...settings.channels, { channel: next, name: defaultChannelName(next) }],
      ...(firstExtra ? { clipChannel: next } : {}),
    });
  };
  const removeRow = (index: number) => set({ channels: settings.channels.filter((_, i) => i !== index) });
  /** Numbers two rows share: CasparCG has one channel per number, so one of them is a typo. */
  const duplicateChannels = [
    ...new Set(settings.channels.map((row) => row.channel).filter((n, i, all) => all.indexOf(n) !== i)),
  ];
  const channelOptions = [...new Map(settings.channels.map((row) => [row.channel, row] as const)).values()];

  return (
    <div data-testid="settings-playout">
      <p className="hint">
        Put a production on a CasparCG channel from its own page, and play the templates and clips
        already on the server, without the CasparCG Client. A browser cannot open the AMCP socket
        itself, so <strong>NoaCG Bridge</strong>, a small program on this machine, holds it.{' '}
        <a href={DOWNLOADS_BRIDGE_URL} target="_blank" rel="noopener" data-testid="bridge-download">
          Download NoaCG Bridge
        </a>{' '}
        (Windows, with a short guide to setting it up) and double-click it; it opens a page that
        pairs this browser. Loading a production&rsquo;s output URL by hand keeps working exactly as before.
      </p>

      <div className="dlg-rows">
        <div className="dlg-row">
          <label htmlFor="bridge-url">NoaCG Bridge</label>
          <div className="dlg-pair">
            <input
              id="bridge-url"
              value={settings.agentUrl}
              onChange={(e) => set({ agentUrl: e.target.value })}
              placeholder="http://127.0.0.1:8899"
              spellCheck={false}
              data-testid="bridge-url"
            />
            <input
              type="password"
              value={settings.agentToken}
              onChange={(e) => set({ agentToken: e.target.value })}
              placeholder="Bridge token"
              aria-label="Bridge token"
              spellCheck={false}
              data-testid="bridge-token"
            />
          </div>
          <p className="dlg-hint" data-testid="bridge-paired" data-paired={paired ? 'yes' : 'no'}>
            {paired
              ? 'Paired. The token stays in this browser; the Bridge only ever listens on this machine.'
              : 'Not paired yet. Start NoaCG Bridge and open the link it prints; both boxes fill in by themselves.'}
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-host">CasparCG server</label>
          {/* Host and AMCP port are one address, so they share a row. */}
          <div className="dlg-pair dlg-pair--num">
            <input
              id="caspar-host"
              value={settings.host}
              onChange={(e) => {
                // Picking a server used before brings its port with it.
                const known = servers.find((server) => server.host === e.target.value);
                set({ host: e.target.value, ...(known ? { amcpPort: known.port } : {}) });
              }}
              placeholder="127.0.0.1"
              spellCheck={false}
              list={servers.length > 0 ? 'caspar-servers' : undefined}
              data-testid="caspar-host"
            />
            {/* The servers used before (NoaCG Bridge remembers them), as the field's own
                suggestions. */}
            {servers.length > 0 && (
              <datalist id="caspar-servers" data-testid="caspar-servers">
                {servers.map((server) => (
                  <option key={`${server.host}:${server.port}`} value={server.host} label={serverAddress(server)} />
                ))}
              </datalist>
            )}
            <input
              type="number"
              min={1}
              max={65535}
              value={settings.amcpPort}
              onChange={(e) => set({ amcpPort: Number(e.target.value) || 0 })}
              aria-label="AMCP port"
              data-testid="caspar-amcp-port"
            />
          </div>
          <p className="dlg-hint">
            The machine running CasparCG on your studio network, and its AMCP port (5250 unless it
            was changed). It is reached from this machine only, never from the internet.
          </p>
        </div>

        {/* THE CHANNELS, named once so every cue in a rundown picks one from a short list beside
            its layer, the way a CasparCG client does. One row is the whole setting for a studio
            with one channel, which is what every studio had before this table. */}
        <div className="dlg-row dlg-row--top">
          <span className="dlg-row-label" id="caspar-channels-label">Channels</span>
          <div className="playout-channels" role="group" aria-labelledby="caspar-channels-label">
            {settings.channels.map((row, i) => {
              const isGraphics = row.channel === settings.channel;
              return (
                <div className="playout-channel-row" key={i} data-testid="caspar-channel-row">
                  <input
                    type="number"
                    min={MIN_PLAYOUT_CHANNEL}
                    max={MAX_PLAYOUT_CHANNEL}
                    value={row.channel}
                    // A cleared box keeps the row's number, and a number past either end of
                    // the range is clamped to it, rather than dropping the row: the table is
                    // saved on every keystroke and a row outside the range does not load.
                    onChange={(e) => {
                      const typed = Math.round(Number(e.target.value));
                      if (!typed) return;
                      setRow(i, { channel: Math.min(MAX_PLAYOUT_CHANNEL, Math.max(MIN_PLAYOUT_CHANNEL, typed)) });
                    }}
                    aria-label={`Channel number, row ${i + 1}`}
                    data-testid="caspar-channel-number"
                  />
                  <input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Name this channel"
                    aria-label={`Channel ${row.channel} name`}
                    data-testid="caspar-channel-name"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    disabled={isGraphics}
                    title={
                      isGraphics
                        ? 'The graphics channel. Choose another channel for graphics below before removing this one.'
                        : `Remove channel ${row.channel}. Cues already on it keep playing there.`
                    }
                    aria-label={`Remove channel ${row.channel}`}
                    data-testid="caspar-channel-remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div>
              <button
                onClick={addRow}
                disabled={highestChannel >= MAX_PLAYOUT_CHANNEL}
                data-testid="caspar-channel-add"
              >
                + Add channel
              </button>
            </div>
          </div>
          {duplicateChannels.length > 0 && (
            <p className="dlg-hint status-warn" data-testid="caspar-channel-duplicate">
              Two rows name channel {duplicateChannels.join(' and ')}. CasparCG has one channel per
              number, so give each row its own.
            </p>
          )}
          <p className="dlg-hint">
            The channels in this server&rsquo;s <code>casparcg.config</code>, named for what they carry.
            Every server cue in a rundown picks one of these beside its layer.
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-graphics-channel">Graphics</label>
          <div className="dlg-pair dlg-pair--num">
            <select
              id="caspar-graphics-channel"
              value={settings.channel}
              onChange={(e) => set({ channel: Number(e.target.value) })}
              data-testid="caspar-graphics-channel"
            >
              {channelOptions.map((row) => (
                <option key={row.channel} value={row.channel}>
                  {channelLabel(settings, row.channel)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={settings.layer}
              onChange={(e) => set({ layer: Number(e.target.value) || 0 })}
              aria-label="Layer"
              data-testid="caspar-layer"
            />
          </div>
          <p className="dlg-hint">
            Where a production&rsquo;s own graphics go on air: CasparCG calls this{' '}
            <code>{slotAddress(slotOf(settings))}</code>. Server templates are cued on this channel,
            on the next free layer above it.
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-clip-channel">Clips</label>
          <select
            id="caspar-clip-channel"
            value={settings.clipChannel}
            onChange={(e) => set({ clipChannel: Number(e.target.value) })}
            data-testid="caspar-clip-channel"
          >
            {channelOptions.map((row) => (
              <option key={row.channel} value={row.channel}>
                {channelLabel(settings, row.channel)}
              </option>
            ))}
          </select>
          <p className="dlg-hint">
            Where a server clip is cued when it is added to a rundown, on layer 10. Any cue can
            pick another channel in its own editor.
          </p>
        </div>
      </div>

      {/* TEST, CONNECT, PUT ON AIR (owner, 2026-09-30). Test asks whether the server answers and
          remembers nothing. Connect asks the same and has NoaCG Bridge remember the server, so the
          next pairing connects by itself. Put on air is offered only where there is a production
          to air - this dialog opened from one - and is the ONE press that sends anything to a
          layer; nothing here does it by itself. */}
      <div className="playout-actions">
        <button onClick={() => void run('test')} disabled={busy !== null || !configured} data-testid="playout-test">
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button onClick={() => void run('connect')} disabled={busy !== null || !configured} data-testid="playout-connect">
          {busy === 'connect' ? 'Connecting…' : 'Connect'}
        </button>
        {outputUrl !== undefined && (
          <button
            onClick={() => void run('air')}
            disabled={busy !== null || !configured || !outputUrl}
            title={outputUrl ? `Load this production's output URL on ${slotAddress(slotOf(settings))} of ${settings.host}` : 'Start the production first: it has no output URL yet'}
            data-testid="playout-put-on-air"
          >
            {busy === 'air' ? 'Sending…' : 'Put on air'}
          </button>
        )}
      </div>
      {outputUrl === null && (
        <p className="dlg-hint" data-testid="playout-air-unstarted">
          Put on air needs the production started: press <strong>Start production</strong> in its
          output links first.
        </p>
      )}
      {result && (
        <p
          className={result.result.state === 'ok' ? 'status-ok' : 'status-bad'}
          data-testid="playout-result"
          data-state={result.result.state}
          data-verb={result.verb}
        >
          {result.result.state !== 'ok'
            ? result.result.detail
            : result.verb === 'air'
              ? `✓ On ${result.address}`
              : `✓ Connected${result.result.version ? ` - CasparCG ${result.result.version}` : ''}${
                  result.verb === 'connect' && result.result.features?.includes('servers')
                    ? '. NoaCG Bridge remembers this server.'
                    : ''
                }`}
        </p>
      )}
      <p className="dlg-hint">
        No connection? <code>noacg caspar status</code> in a terminal makes the same call without a
        browser, and says whether the problem is this page or the server. Chrome, Edge and Firefox
        work; Safari refuses a secure page reaching a local address outright, and there{' '}
        <code>noacg caspar play</code> airs a production with no browser at all. A browser that
        asks for permission again and again is set to forget it:{' '}
        <a href="/downloads#browsers" target="_blank" rel="noopener">
          the browser notes
        </a>{' '}
        name the setting.
      </p>
      <p className="dlg-hint">
        Which server versions work, what to put on a channel by hand, and how to play an exported
        file are in the{' '}
        <a href="/docs#casparcg" target="_blank" rel="noreferrer">
          CasparCG guide
        </a>
        .
      </p>
    </div>
  );
}
