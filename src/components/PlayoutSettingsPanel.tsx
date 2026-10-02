import { useEffect, useState } from 'react';
import { MAX_PLAYOUT_CHANNEL, MIN_PLAYOUT_CHANNEL } from '../model/shows';
import {
  channelLabel,
  connectServer,
  defaultChannelName,
  loadPlayoutSettings,
  pairingLinkForAnotherBrowser,
  playoutConfigured,
  putOutputOnAir,
  savePlayoutSettings,
  serverAddress,
  slotAddress,
  slotOf,
  syncStudio,
  targetOf,
  testConnection,
  type PlayoutChannel,
  type PlayoutResult,
  type PlayoutSettings,
  type StudioKeeper,
} from '../control/playoutLink';
import type { RememberedServer } from '../control/playoutProtocol';
import { CHANNEL_NAME_MAX, studioOf } from '../control/studioSetup';
import { DOWNLOADS_BRIDGE_URL } from '../downloads/links';
import CopyPairingLink from './CopyPairingLink';
import RecentServers from './RecentServers';

/** How long the setup waits after the last keystroke before NoaCG Bridge is given it. */
const KEEP_AFTER_MS = 600;

/** Where the setup above is kept, in one line (D17). */
function keeperLine(keeper: StudioKeeper, s: PlayoutSettings): string {
  switch (keeper) {
    case 'bridge':
      return `NoaCG Bridge keeps this setup for ${serverAddress(targetOf(s))}, for every browser paired with it.`;
    case 'ready':
      return `Change anything here and NoaCG Bridge keeps it for ${serverAddress(targetOf(s))}, for every browser paired with it.`;
    case 'unconnected':
      return `Kept in this browser. Press Connect, and NoaCG Bridge keeps it for ${serverAddress(targetOf(s))} and every browser paired with it.`;
    case 'away':
      return 'NoaCG Bridge does not answer, so this is the setup this browser holds.';
    case 'waiting':
      return 'Kept in this browser. NoaCG Bridge is given it the next time it answers.';
    default:
      return 'Kept in this browser. NoaCG Bridge 0.8.0 or newer keeps it for every browser paired with it.';
  }
}

/** The panel's three presses. */
type Verb = 'test' | 'connect' | 'air';

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
  // The verdict, with its success sentence written AT THE PRESS: it is past tense, so it must not be
  // re-derived from settings typed since (ProductionLinks.tsx, BridgeAirRow, says what that cost
  // once). WHICH button produced it rides along for the specs.
  const [result, setResult] = useState<{ verb: Verb; result: PlayoutResult; ok: string } | null>(null);
  // The servers NoaCG Bridge remembers this studio connecting to, one press each.
  const [servers, setServers] = useState<RememberedServer[]>([]);
  // Where the studio setup is kept (D17). Unknown until the first sync answers.
  const [keeper, setKeeper] = useState<StudioKeeper | null>(null);
  const paired = Boolean(settings.agentToken.trim());

  /** Bring this browser's setup and the Bridge's together, and show what came of it: the Bridge's
   *  setup when it held a newer one, and the list it answered with. */
  const sync = async (alive: () => boolean = () => true) => {
    const done = await syncStudio();
    if (!alive()) return;
    if (done.servers) setServers(done.servers);
    setKeeper(done.keeper);
    if (done.changed) setSettings(loadPlayoutSettings());
  };
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    void sync(() => alive);
    return () => {
      alive = false;
    };
  }, [paired]);

  // A CHANGE TO THE SETUP goes to NoaCG Bridge a moment after the last keystroke (the table saves on
  // every one), and at once when the panel closes, so another browser opens with it. Only a change
  // made here is marked for the Bridge (`studioPending`); the Bridge's own setup arriving is not.
  const studioKey = JSON.stringify(studioOf(settings));
  useEffect(() => {
    if (!paired || !loadPlayoutSettings().studioPending) return;
    const timer = setTimeout(() => void sync(), KEEP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [studioKey, paired]);
  useEffect(
    () => () => {
      if (loadPlayoutSettings().studioPending) void syncStudio();
    },
    [],
  );

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
    const connectedTo = (r: PlayoutResult) => `✓ Connected${r.version ? ` - CasparCG ${r.version}` : ''}`;
    try {
      if (verb === 'test') {
        const r = await testConnection(now);
        setResult({ verb, result: r, ok: connectedTo(r) });
      } else if (verb === 'connect') {
        const connected = await connectServer(now);
        if (connected.servers) setServers(connected.servers);
        // The server's setup, from NoaCG Bridge when it keeps one: the table below shows it.
        if (connected.studio) {
          setKeeper(connected.studio.keeper);
          if (connected.studio.changed) setSettings(loadPlayoutSettings());
        }
        const r = connected.result;
        setResult({ verb, result: r, ok: `${connectedTo(r)}${r.features?.includes('servers') ? '. NoaCG Bridge remembers this server.' : ''}` });
      } else if (outputUrl) {
        const r = await putOutputOnAir(now, outputUrl);
        setResult({ verb, result: r, ok: `✓ On ${slotAddress(slotOf(now))} of ${serverAddress(targetOf(now))}` });
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
          {/* ANOTHER BROWSER, or another account in its own browser profile, pairs with a link this
              one asks the Bridge for (D19), so nobody has to find the Bridge window for it. */}
          {paired && (
            <CopyPairingLink
              lead="Pairing another browser?"
              button="Copy a link for it"
              link={() => pairingLinkForAnotherBrowser(loadPlayoutSettings())}
              testId="playout-pair-another"
            />
          )}
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-host">CasparCG server</label>
          {/* Host and AMCP port are one address, so they share a row. */}
          <div className="dlg-pair dlg-pair--num">
            <input
              id="caspar-host"
              value={settings.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="127.0.0.1"
              spellCheck={false}
              data-testid="caspar-host"
            />
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
          {/* A server used before is ONE press: it fills in the address and port and connects,
              as on the pairing page. */}
          {paired && (
            <RecentServers
              servers={servers}
              current={{ host: settings.host.trim(), port: settings.amcpPort }}
              onPick={(server) => {
                set({ host: server.host, amcpPort: server.port });
                void run('connect');
              }}
              disabled={busy !== null}
              testId="caspar-recent"
            />
          )}
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
                    maxLength={CHANNEL_NAME_MAX}
                    aria-label={`Channel ${row.channel} name`}
                    data-testid="caspar-channel-name"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    disabled={isGraphics}
                    title={
                      isGraphics
                        ? 'The NoaCG output plays on this channel. Move the NoaCG output to another channel below before removing this one.'
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
            The channels in this server&rsquo;s <code>casparcg.config</code>. A name is optional.
            Every server item in a rundown picks one of these beside its layer.
          </p>
        </div>

        {/* THE NOACG OUTPUT'S SLOT, stored as `channel` and `layer` since before channels had
            names. NoaCG does not say what a channel is for (owner, 2026-10-01): this is only
            where its own output plays, and the one slot a server item may never take. */}
        <div className="dlg-row">
          <label htmlFor="caspar-graphics-channel">NoaCG output</label>
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
            NoaCG&rsquo;s own graphics play on <code>{slotAddress(slotOf(settings))}</code>. No server item
            may use that slot.
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-clip-channel">New media</label>
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
            The channel a server video, still or audio file starts on. Each can move in its own editor.
          </p>
        </div>
      </div>
      {/* WHERE THE SETUP ABOVE IS KEPT (D17): in NoaCG Bridge for this server, so every browser and
          account paired with it opens with it, or in this browser only, and why. */}
      {keeper && (
        <p className="dlg-hint" data-testid="playout-studio-keeper" data-keeper={keeper}>
          {keeperLine(keeper, settings)}
        </p>
      )}

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
            title={outputUrl ? `Load this production's output URL on ${slotAddress(slotOf(settings))} of ${serverAddress(targetOf(settings))}` : 'Start the production first: it has no output URL yet'}
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
          {result.result.state === 'ok' ? result.ok : result.result.detail}
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
