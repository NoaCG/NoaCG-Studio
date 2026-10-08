import { useCallback, useEffect, useRef, useState } from 'react';
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
  serverChannels,
  slotAddress,
  slotOf,
  syncStudio,
  targetOf,
  testConnection,
  type PlayoutChannel,
  type PlayoutResult,
  type PlayoutSettings,
  type PlayoutState,
  type StudioKeeper,
  type StudioSync,
} from '../control/playoutLink';
import { MAX_CHANNEL_NAME, MAX_STUDIO_LAYER, type RememberedServer, type ServerChannel } from '../control/playoutProtocol';
import { plural } from '../control/readiness';
import { casparOutputTarget } from '../control/playoutStatus';
import { studioOf } from '../control/studioSetup';
import { DOWNLOADS_BRIDGE_URL } from '../downloads/links';
import CopyPairingLink from './CopyPairingLink';
import RecentServers from './RecentServers';

/** How long the setup waits after the last keystroke before NoaCG Bridge is given it. */
const KEEP_AFTER_MS = 600;
/** How often an open panel asks again while a change waits for NoaCG Bridge: the status poll's pace. */
const RETRY_WAITING_MS = 3000;

/** Where the setup above is kept, in a few words; `keeperLine` is the whole account (D17). A
 *  failure keeps its whole sentence, since it says what to do. */
function keeperShort(keeper: StudioKeeper, s: PlayoutSettings, reason?: PlayoutState): string {
  if (keeper === 'away') return keeperLine(keeper, s, reason);
  return keeper === 'bridge' || keeper === 'ready' ? 'Kept in NoaCG Bridge' : 'Kept in this browser';
}

/** Where the setup above is kept, in one line (D17). */
function keeperLine(keeper: StudioKeeper, s: PlayoutSettings, reason?: PlayoutState): string {
  switch (keeper) {
    case 'bridge':
      return `NoaCG Bridge keeps this setup for ${serverAddress(targetOf(s))}, for every browser paired with it.`;
    case 'ready':
      return `Change anything here and NoaCG Bridge keeps it for ${serverAddress(targetOf(s))}, for every browser paired with it.`;
    case 'unconnected':
      return `Kept in this browser. Press Connect, and NoaCG Bridge keeps it for ${serverAddress(targetOf(s))} and every browser paired with it.`;
    case 'away':
      return reason === 'token'
        ? "NoaCG Bridge rejected this browser's token, so this is the setup this browser holds. Pair this browser again from the link the Bridge prints."
        : 'NoaCG Bridge does not answer, so this is the setup this browser holds.';
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
export default function PlayoutSettingsPanel({ outputUrl, onOutputOnAir }: { outputUrl?: string | null; onOutputOnAir?: (result: PlayoutResult, target: string) => void } = {}) {
  const [settings, setSettings] = useState(loadPlayoutSettings);
  const [busy, setBusy] = useState<Verb | null>(null);
  // The verdict, with its success sentence written AT THE PRESS: it is past tense, so it must not be
  // re-derived from settings typed since (a Load line once named a channel typed after the
  // press). WHICH button produced it rides along for the specs.
  const [result, setResult] = useState<{ verb: Verb; result: PlayoutResult; ok: string } | null>(null);
  // The servers NoaCG Bridge remembers this studio connecting to, one press each.
  const [servers, setServers] = useState<RememberedServer[]>([]);
  // Where the studio setup is kept (D17), and why the Bridge was not asked. Unknown until the first
  // sync answers.
  const [keeper, setKeeper] = useState<{ keeper: StudioKeeper; reason?: PlayoutState } | null>(null);
  // The channels the server reports having, for the server they were read from: a list read from
  // one address never speaks for another typed since. Null while no server has said.
  const [reported, setReported] = useState<{ at: string; channels: ServerChannel[] } | null>(null);
  const channelReads = useRef(0);
  const paired = Boolean(settings.agentToken.trim());

  /** Ask the server which channels it has: when the panel opens, and after Test or Connect
   *  reaches it. Only the latest read lands, so a slow one for a server left behind never
   *  replaces it; and one that gets no answer keeps the last list, since the server's config did
   *  not change because one reading timed out. */
  const readChannels = useCallback(async (alive: () => boolean = () => true) => {
    const read = ++channelReads.current;
    const now = loadPlayoutSettings();
    const channels = await serverChannels(now);
    if (alive() && read === channelReads.current && channels) setReported({ at: serverAddress(targetOf(now)), channels });
  }, []);
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    void readChannels(() => alive);
    return () => {
      alive = false;
    };
  }, [paired, readChannels]);

  /** What a sync came to: the Bridge's setup when it held a newer one, its list, and the keeper line. */
  const show = useCallback((done: StudioSync) => {
    if (done.servers) setServers(done.servers);
    setKeeper({ keeper: done.keeper, reason: done.reason });
    if (done.changed) setSettings(loadPlayoutSettings());
  }, []);
  /** Bring this browser's setup and the Bridge's together, and show what came of it. */
  const sync = useCallback(
    async (alive: () => boolean = () => true) => {
      const done = await syncStudio();
      if (alive()) show(done);
    },
    [show],
  );
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    void sync(() => alive);
    return () => {
      alive = false;
    };
  }, [paired, sync]);

  // A CHANGE TO THE SETUP goes to NoaCG Bridge a moment after the last keystroke (the table saves on
  // every one), and at once when the panel closes, so another browser opens with it. Only a change
  // made here is marked for the Bridge (`studioPending`); the Bridge's own setup arriving is not.
  const studioKey = JSON.stringify(studioOf(settings));
  useEffect(() => {
    if (!paired || !loadPlayoutSettings().studioPending) return;
    // Asked again when it fires: the sync the panel opened with may have given the Bridge it already.
    const timer = setTimeout(() => {
      if (loadPlayoutSettings().studioPending) void sync();
    }, KEEP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [studioKey, paired, sync]);
  useEffect(
    () => () => {
      if (loadPlayoutSettings().studioPending) void syncStudio();
    },
    [],
  );
  // A CHANGE WAITING FOR NOACG BRIDGE, while the panel is open: asked again every few seconds until
  // the Bridge takes it. Opened from Home nothing else asks the Bridge, so a change typed while it
  // was away otherwise reached it only when the panel was opened again. Closed, the change goes with
  // the next production page's status poll or the next opening of this panel (D17).
  const waiting = keeper?.keeper === 'waiting';
  useEffect(() => {
    if (!paired || !waiting) return;
    const timer = setInterval(() => {
      if (loadPlayoutSettings().studioPending) void sync();
    }, RETRY_WAITING_MS);
    return () => clearInterval(timer);
  }, [paired, waiting, sync]);

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
        if (r.state === 'ok') void readChannels();
      } else if (verb === 'connect') {
        const connected = await connectServer(now);
        if (connected.servers) setServers(connected.servers);
        // The server's setup, from NoaCG Bridge when it keeps one: the table below shows it.
        if (connected.studio) show(connected.studio);
        const r = connected.result;
        setResult({ verb, result: r, ok: `${connectedTo(r)}${r.features?.includes('servers') ? '. NoaCG Bridge remembers this server.' : ''}` });
        if (r.state === 'ok') void readChannels();
      } else if (outputUrl) {
        const r = await putOutputOnAir(now, outputUrl);
        setResult({ verb, result: r, ok: `✓ On ${slotAddress(slotOf(now))} of ${serverAddress(targetOf(now))}` });
        onOutputOnAir?.(r, casparOutputTarget(now));
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
  // What the server reports, when it is the server these settings name. A row it lacks is a cue
  // that would not play there, so it is said, never silently dropped: the server may be one
  // started with another config for the moment.
  const onServer = reported && reported.at === serverAddress(targetOf(settings)) ? reported.channels : null;
  const modeOf = new Map(onServer?.map((c) => [c.channel, c.mode]));
  const notOnServer = onServer ? [...new Set(settings.channels.map((row) => row.channel).filter((n) => !modeOf.has(n)))] : [];
  /** The next channel the server has that no row names, else the next number up (a channel the
   *  server lacks is then said, not refused: a studio may be preparing another config); named by
   *  its number like every new row. While clips still share the graphics
   *  channel, the new row also becomes the clip default: a studio adds a second channel to put
   *  something else on it, and a stock single-channel studio never has a clip aimed at a channel
   *  it lacks. Both picks stay one select away below. */
  const highestChannel = Math.max(...settings.channels.map((row) => row.channel));
  const offered = onServer?.find((c) => c.channel <= MAX_PLAYOUT_CHANNEL && !settings.channels.some((row) => row.channel === c.channel))?.channel;
  const nextChannel = offered ?? (highestChannel < MAX_PLAYOUT_CHANNEL ? highestChannel + 1 : undefined);
  const addRow = () => {
    if (nextChannel === undefined) return;
    const firstExtra = settings.clipChannel === settings.channel;
    set({
      channels: [...settings.channels, { channel: nextChannel, name: defaultChannelName(nextChannel) }],
      ...(firstExtra ? { clipChannel: nextChannel } : {}),
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
      {/* No explanatory paragraph (playout-workflow-simplification AC-10): the download, and why
          it is needed in its tooltip. */}
      <p className="hint">
        <a
          href={DOWNLOADS_BRIDGE_URL}
          target="_blank"
          rel="noopener"
          title="A browser cannot open CasparCG's AMCP socket, so NoaCG Bridge, a small program on this computer, holds it. Run it and it opens a page that pairs this browser."
          data-testid="bridge-download"
        >
          Download NoaCG Bridge
        </a>{' '}
        (Windows)
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
          <p
            className="dlg-hint"
            title={paired ? 'The token stays in this browser; the Bridge only listens on this computer.' : undefined}
            data-testid="bridge-paired"
            data-paired={paired ? 'yes' : 'no'}
          >
            {paired ? 'Paired' : 'Not paired yet. Start NoaCG Bridge and open the link it prints.'}
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
              title="The computer running CasparCG, and its AMCP port (5250 unless changed). Reached from this computer only."
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
                <div className={`playout-channel-row${onServer ? ' playout-channel-row--server' : ''}`} key={i} data-testid="caspar-channel-row">
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
                    maxLength={MAX_CHANNEL_NAME}
                    aria-label={`Channel ${row.channel} name`}
                    data-testid="caspar-channel-name"
                  />
                  {onServer && (
                    // The channel's video mode, in the server's own words, or that it has none.
                    <span
                      className={`playout-channel-mode${modeOf.has(row.channel) ? '' : ' status-warn'}`}
                      title={modeOf.get(row.channel) ?? `This server has no channel ${row.channel}.`}
                      data-testid="caspar-channel-mode"
                    >
                      {modeOf.get(row.channel) ?? 'Not on server'}
                    </span>
                  )}
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
                disabled={nextChannel === undefined}
                data-testid="caspar-channel-add"
              >
                {offered !== undefined ? `+ Add channel ${offered}` : '+ Add channel'}
              </button>
            </div>
          </div>
          {duplicateChannels.length > 0 && (
            <p className="dlg-hint status-warn" data-testid="caspar-channel-duplicate">
              Two rows name channel {duplicateChannels.join(' and ')}. CasparCG has one channel per
              number, so give each row its own.
            </p>
          )}
          {notOnServer.length > 0 && (
            <p className="dlg-hint status-warn" data-testid="caspar-channel-missing">
              This server has no channel {notOnServer.join(' or ')}, so a cue on it would not play.
              Change the row&rsquo;s number, or remove a row you do not use.
            </p>
          )}
          {onServer && (
            <p className="dlg-hint" data-testid="caspar-channels-hint">
              The server reports {plural(onServer.length, 'channel')}.
            </p>
          )}
        </div>

        {/* THE NOACG OUTPUT'S SLOT, stored as `channel` and `layer` since before channels had
            names. NoaCG does not say what a channel is for (owner, 2026-10-01): this is only
            where its own output plays, and the one slot a server item may never take. */}
        <div className="dlg-row">
          <label htmlFor="caspar-graphics-channel" title={`NoaCG's own graphics play on ${slotAddress(slotOf(settings))}. No server item may use that slot.`}>
            NoaCG output
          </label>
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
              max={MAX_STUDIO_LAYER}
              value={settings.layer}
              // Held to what NoaCG Bridge keeps, a whole number from 0 to 9999, as it is typed: the
              // Bridge's copy is clamped, and a browser left holding 12000 would play its output on
              // a slot no other browser paired with that Bridge uses.
              onChange={(e) => set({ layer: Math.min(MAX_STUDIO_LAYER, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
              aria-label="Layer"
              data-testid="caspar-layer"
            />
          </div>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-clip-channel" title="The channel a server video, still or audio file starts on. Each can move in its own editor.">
            New media
          </label>
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
        </div>
      </div>
      {/* WHERE THE SETUP ABOVE IS KEPT (D17): in NoaCG Bridge for this server, so every browser and
          account paired with it opens with it, or in this browser only, and why. */}
      {keeper && (
        <p
          className="hint"
          title={keeperLine(keeper.keeper, settings, keeper.reason)}
          data-testid="playout-studio-keeper"
          data-keeper={keeper.keeper}
        >
          {keeperShort(keeper.keeper, settings, keeper.reason)}
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
            title={outputUrl ? `Load this production's output URL on ${slotAddress(slotOf(settings))} of ${serverAddress(targetOf(settings))}` : 'Publish the production first'}
            data-testid="playout-put-on-air"
          >
            {busy === 'air' ? 'Sending…' : 'Load'}
          </button>
        )}
      </div>
      {outputUrl === null && (
        <p className="hint" data-testid="playout-air-unstarted">
          Publish the production first.
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
      <p className="hint">
        <a
          href="/downloads#browsers"
          target="_blank"
          rel="noopener"
          title="noacg caspar status in a terminal makes the same call without a browser. Chrome, Edge and Firefox work; Safari refuses a secure page reaching a local address."
        >
          Troubleshooting
        </a>
        {' · '}
        <a href="/docs#casparcg" target="_blank" rel="noreferrer">
          CasparCG guide
        </a>
      </p>
    </div>
  );
}
