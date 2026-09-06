import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { eventButtons, eventLegality, eventPayload, fieldDescriptors, isEventLegal, movedKeys, type ControlButton } from '../control/controlModel';
import SpxFieldRow from './fields/SpxFieldRow';
import { renderControlPanelHtml } from '../control/controlPanelHtml';
import { hasLiveData, liveDataBlock, stripLiveData } from '../control/liveData';
import {
  hasRealtimeControl,
  realtimeControlBlock,
  stripRealtimeControl,
  remoteControlConfig,
} from '../control/realtimeControl';
import { isBackendConfigured } from '../backend/config';
import { useAuthState } from './auth/useAuthState';
import { useAuthUi } from './auth/authUi';
import { hasChatGraphic, chatGraphicBlock, stripChatGraphic, chatBackendRefKey, type ChatMode } from '../showchat/chatGraphicBlock';
import { listMyShows, type ShowRow } from '../showchat/chatData';
import ModerationPanel from '../showchat/ModerationPanel';
import { slug } from '../model/slug';
import { addGraphicToShow, createShow, loadShows, type Show } from '../model/shows';
import { commitDurableWrites } from '../model/durableStore';
import { useTemplateStore, type PlayoutAction } from '../store/templateStore';
import { useRouter } from '../app/router';

/**
 * The Control panel — an operator view generated from the template's fields (the same
 * modular engine that produces the standalone controlpanel.html export). Every edit
 * live-drives the preview; the action buttons play/stop/update/next it. There is no
 * per-template code: the fields become descriptors and each renders the shared field control
 * — number → stepper, textarea → line list, image → picker, etc.
 */
export default function ControlPanel() {
  const template = useTemplateStore((s) => s.template);
  const sendControl = useTemplateStore((s) => s.sendControl);
  const sendEvent = useTemplateStore((s) => s.sendEvent);
  const sampleData = useTemplateStore((s) => s.sampleData);
  const setSampleValue = useTemplateStore((s) => s.setSampleValue);
  const savedGraphicId = useTemplateStore((s) => s.saved.graphicId);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const [live, setLive] = useState(true);
  const [sheetUrl, setSheetUrl] = useState('');
  const [pollSecs, setPollSecs] = useState('5');
  const [moderationOpen, setModerationOpen] = useState(false);
  const [chatShows, setChatShows] = useState<ShowRow[]>([]);
  const [chatShowId, setChatShowId] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>('feed');
  // ── Shows (the rundown level): local model, aggregated control-page export ──
  const [shows, setShows] = useState<Show[]>(() => loadShows());
  const [showId, setShowId] = useState('');
  const [newShowName, setNewShowName] = useState('');
  const [showNote, setShowNote] = useState<string | null>(null);
  const activeShow = shows.find((s) => s.id === showId) ?? null;

  const makeShow = () => {
    const next = createShow(newShowName);
    setShows(next);
    setShowId(next[next.length - 1]?.id ?? '');
    setNewShowName('');
  };
  const addCurrent = async () => {
    if (!activeShow) return;
    // A saved document carries its library id into the show, so publishing the hosted control
    // page can find the graphic's saved entries (control/hostedControl.ts).
    const { shows: next, error } = addGraphicToShow(activeShow.id, template, { graphicId: savedGraphicId });
    setShows(next);
    // Confirmed before it reports: the durable store accepts a write and answers a moment later
    // (model/durableStore.ts), so the returned error alone would say the graphic is in the
    // production when the write was refused. Claiming the failure also keeps THIS note, which
    // names the graphic, instead of the app-level dialog's generic one.
    const failure = error ?? (await commitDurableWrites());
    setShowNote(failure ?? `✓ "${template.name}" is in the production (same name updates in place).`);
  };

  const controls = fieldDescriptors(template.fields); // operator view: hidden fields stay hidden
  // The machine's event buttons (empty without an explicit machine — the derived linear
  // machine's one event is `next`, which the lifecycle row already carries).
  const events = useMemo(() => eventButtons(template.js), [template.js]);
  // Greyed exactly where the graphic would drop the press — the same structural guard the
  // hosted control page mirrors, read against the live pointers the simulator publishes.
  const eventLegal = useMemo(() => eventLegality(template.js), [template.js]);
  const machineGroups = useTemplateStore((s) => s.machineGroups);
  const eventSections = useMemo(() => {
    const sections = new Map<string, ControlButton[]>();
    for (const e of events) {
      const name = e.section ?? 'Events';
      sections.set(name, [...(sections.get(name) ?? []), e]);
    }
    return [...sections.entries()];
  }, [events]);
  // A button's payload rides the event with the fields' CURRENT sample values — applied by
  // the graphic only if the machine accepts the event (the atomic multi-part change). An
  // `adjust` field (a goal's +1) rides moved by its delta, and the new figure is written back
  // into the sample data so the field box reads it and the next press counts from it.
  const fireEvent = (e: ControlButton) => {
    const payload = eventPayload(e, (key) => sampleData[key]);
    sendEvent(e.event, payload);
    for (const key of movedKeys(e)) {
      if (payload?.[key] !== undefined) setSampleValue(key, payload[key]);
    }
  };
  const liveDataOn = hasLiveData(template.js);
  const remoteOn = hasRealtimeControl(template.js);
  const backendConfigured = isBackendConfigured();
  const { needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const remote = backendConfigured ? remoteControlConfig(template.name) : null;

  const drive = (action: PlayoutAction) => sendControl(action);

  const downloadPanel = () => {
    // Bundle the remote-send path into the panel only when this graphic has remote control enabled.
    const html = renderControlPanelHtml(template, remoteOn ? remote : null);
    saveAs(new Blob([html], { type: 'text/html' }), `${slug(template.name)}_controlpanel.html`);
  };

  // Append / remove the remote-control receiver block in the graphic's own JS (undoable, and
  // highlighted in the editor). The exported graphic then listens on the Supabase Realtime topic.
  const enableRemote = () => {
    if (!remote) return;
    const js = stripRealtimeControl(template.js).trimEnd() + '\n\n' + realtimeControlBlock(remote);
    applyTemplate({ ...template, js });
    setActiveTab('js');
  };
  const disableRemote = () => {
    applyTemplate({ ...template, js: stripRealtimeControl(template.js) });
    setActiveTab('js');
  };

  // ── Show chat ──
  const chatOn = hasChatGraphic(template.js);
  const chatRefKey = backendConfigured ? chatBackendRefKey() : null;
  useEffect(() => {
    if (!backendConfigured || needsSignIn) return; // shows are per-account; skip when signed out
    void listMyShows().then((s) => {
      setChatShows(s);
      setChatShowId((id) => id || s[0]?.id || '');
    });
  }, [backendConfigured, needsSignIn, moderationOpen]); // refresh after moderating (shows may have been created)

  const enableChat = () => {
    if (!chatRefKey || !chatShowId) return;
    const block = chatGraphicBlock({
      ...chatRefKey,
      showId: chatShowId,
      mode: chatMode,
      pollSeconds: 4,
      feedField: 'f0',
      authorField: 'f0',
      messageField: 'f1',
    });
    applyTemplate({ ...template, js: stripChatGraphic(template.js).trimEnd() + '\n\n' + block });
    setActiveTab('js');
  };
  const disableChat = () => {
    applyTemplate({ ...template, js: stripChatGraphic(template.js) });
    setActiveTab('js');
  };

  // Add / replace the live-data polling block in the template's own JS (undoable, and
  // highlighted in the editor). It maps sheet columns to fields and calls update().
  const addLiveData = () => {
    const block = liveDataBlock({ csvUrl: sheetUrl.trim(), pollSeconds: Number(pollSecs) || 5, fields: template.fields });
    const js = stripLiveData(template.js).trimEnd() + '\n\n' + block;
    applyTemplate({ ...template, js });
    setActiveTab('js');
  };
  const removeLiveData = () => {
    applyTemplate({ ...template, js: stripLiveData(template.js) });
    setActiveTab('js');
  };

  return (
    <div>
      <div className="panel-section">
        <h3>Rehearse <span className="muted">— operator view</span></h3>
        <p className="hint">
          The operator view, here for <strong>rehearsal</strong>: auto-built from this graphic's
          fields, its edits and buttons drive <strong>this preview</strong> so you can play it
          through before air. The real on-air surface is the graphic's own <strong>Control
          panel</strong> (Home → Control panels, or the standalone copy you download below).
        </p>
      </div>

      <label className="row" style={{ gap: 8, marginBottom: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={live} onChange={(e) => setLive(e.target.checked)} />
        <span>Live — send every edit to the preview</span>
      </label>

      {controls.length === 0 && <p className="muted">This template has no editable fields.</p>}
      {controls.map((d) => (
        <SpxFieldRow key={d.key} descriptor={d} live={live} />
      ))}

      {eventSections.length > 0 && (
        <div className="ctl-events">
          {eventSections.map(([section, btns]) => (
            <div key={section} className="ctl-event-section">
              <h4>{section}</h4>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {btns.map((e) => {
                  const legal = isEventLegal(eventLegal, e.event, machineGroups && { groups: machineGroups });
                  return (
                    <button
                      key={e.event}
                      className={e.destructive ? 'ctl-event-destructive' : undefined}
                      onClick={() => fireEvent(e)}
                      disabled={!legal}
                      title={
                        !legal
                          ? `"${e.event}" has no arrow out of the current state, so the graphic would drop it`
                          : e.payload?.length
                            ? // The payload in the OPERATOR'S words, never as `f7`
                              // (docs/PLAYOUT_DASHBOARD.md §7b): "carrying Audience results" says
                              // what the press airs, and a field id says none of it.
                              `Fires "${e.event}" with ${(e.payload ?? [])
                                .map((key) => controls.find((d) => d.key === key)?.label ?? key)
                                .join(', ')}`
                            : `Fires "${e.event}"`
                      }
                    >
                      ⚡ {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ctl-actions">
        <button className="primary" onClick={() => drive('play')}>▶ Play</button>
        <button onClick={() => drive('stop')}>■ Stop</button>
        <button onClick={() => drive('update')}>⟳ Update</button>
        <button onClick={() => drive('next')}>» Next</button>
      </div>

      <div className="divider" />
      <button onClick={downloadPanel} title="A self-contained operator page that drives the exported graphic">
        ⬇ Download control panel (.html)
      </button>

      <div className="divider" />
      <div className="panel-section">
        <h3>Productions <span className="muted">— graphics that run together</span></h3>
        {/* SLIM by design (docs/GOALS_ARCHIVE.md "Student release" step 8): this block only puts the
            current graphic INTO a production. The layer stack, export, publishing and the
            links all live on the production's own page — two surfaces carrying the same
            controls is how they drift. */}
        <p className="hint">
          A production collects graphics that run at once (bug + lower third + ticker) and the
          prepared CUES that air on them. Add the current graphic here; everything else — cues,
          layers, export, publishing, operating — lives on the production’s own page.
        </p>
        <div className="row">
          <input
            placeholder="New production name"
            value={newShowName}
            onChange={(e) => setNewShowName(e.target.value)}
          />
          <button onClick={makeShow} disabled={!newShowName.trim()}>Create</button>
        </div>
        {shows.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            <select className="grow" value={showId} onChange={(e) => setShowId(e.target.value)}>
              <option value="">Pick a production…</option>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.graphics.length})</option>
              ))}
            </select>
            {activeShow && (
              <button className="primary" onClick={() => void addCurrent()} title="Add or update this graphic in the production">
                + Add current
              </button>
            )}
          </div>
        )}
        {activeShow && (
          <div className="row" style={{ marginTop: 8 }}>
            <button
              onClick={() => useRouter.getState().navigate({ view: 'production', id: activeShow.id })}
              title="Cues, layers, links, publishing, and operating live on the production's page"
              data-testid="open-production-page"
            >
              Open production page →
            </button>
          </div>
        )}
        {/* The same slot carries confirmations AND failures, so it must not paint every one of
            them green. ✓ leads a success, as it does in Home. */}
        {showNote && (
          <p className={showNote.startsWith('✓') ? 'status-ok' : 'status-bad'} style={{ marginTop: 6 }}>
            {showNote}
          </p>
        )}
      </div>

      <div className="divider" />
      <div className="panel-section">
        <h3>Live data <span className="muted">— Google Sheet</span></h3>
        <p className="hint">
          Drive the graphic from a spreadsheet. In Sheets: <em>File → Share → Publish to web →
          CSV</em>, paste the link, and the graphic follows every edit. The polling code is added
          to the JS for you to read and tweak (column → field mapping and all).
        </p>
        <input
          placeholder="https://docs.google.com/…/pub?output=csv"
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <label className="muted" style={{ fontSize: 12 }}>every</label>
          <input type="number" style={{ width: 64 }} value={pollSecs} onChange={(e) => setPollSecs(e.target.value)} />
          <label className="muted" style={{ fontSize: 12 }}>seconds</label>
          <div className="spacer" style={{ flex: 1 }} />
          {liveDataOn && <button onClick={removeLiveData} title="Remove the live-data block">Remove</button>}
          <button className="primary" disabled={!sheetUrl.trim()} onClick={addLiveData}>
            {liveDataOn ? 'Update block' : 'Add live data'}
          </button>
        </div>
        {liveDataOn && <p className="status-ok" style={{ marginTop: 6 }}>✓ Live-data block is in the JS (see the marked region).</p>}
      </div>

      {backendConfigured && (
        <div className="panel-section">
          <div className="divider" />
          <h3>Remote control <span className="muted">— any device</span></h3>
          <p className="hint">
            Drive the <em>exported</em> graphic from another device over the cloud. Enabling adds a
            small, deletable receiver block to the JS; the downloaded control panel then also sends
            over Supabase Realtime. The graphic and panel share an unguessable <strong>topic</strong> —
            treat it as a secret. The default export stays fully offline.
          </p>
          {remote ? (
            <>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  readOnly
                  value={remote.topic}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                  title="Shared channel topic (keep secret)"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="spacer" style={{ flex: 1 }} />
                {remoteOn && <button onClick={disableRemote} title="Remove the remote-control block">Remove</button>}
                <button className="primary" onClick={enableRemote}>{remoteOn ? 'Update block' : 'Enable remote'}</button>
              </div>
              {remoteOn && (
                <p className="status-ok" style={{ marginTop: 6 }}>
                  ✓ Remote-control block is in the JS. Download the control panel and open it on any device.
                </p>
              )}
            </>
          ) : (
            <p className="muted">Sign in to enable cloud remote control.</p>
          )}
        </div>
      )}

      {backendConfigured && (
        <div className="panel-section">
          <div className="divider" />
          <h3>Show chat <span className="muted">— audience send-in</span></h3>
          <p className="hint">
            Share a public link; viewers submit messages you approve and send to air. Manage the
            queue, then add a graphic block that shows the on-air messages.
          </p>
          <button
            onClick={() =>
              needsSignIn
                ? openSignIn('Sign in to run a show chat — audience send-in with moderation.')
                : setModerationOpen(true)
            }
          >
            💬 Manage &amp; moderate
          </button>

          {needsSignIn ? (
            <p className="muted" style={{ marginTop: 6 }}>
              Show chat needs an account —{' '}
              <button className="link-inline" onClick={() => openSignIn('Sign in to run a show chat — audience send-in with moderation.')}>
                sign in
              </button>{' '}
              to create shows and moderate messages.
            </p>
          ) : chatRefKey ? (
            <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
              <select className="grow" value={chatShowId} onChange={(e) => setChatShowId(e.target.value)}>
                {chatShows.length === 0 && <option value="">Create a show first</option>}
                {chatShows.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              <select value={chatMode} onChange={(e) => setChatMode(e.target.value as ChatMode)} title="How on-air messages appear">
                <option value="feed">Feed</option>
                <option value="spotlight">Spotlight</option>
              </select>
              {chatOn && <button onClick={disableChat}>Remove</button>}
              <button className="primary" disabled={!chatShowId} onClick={enableChat}>{chatOn ? 'Update block' : 'Add chat'}</button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 6 }}>Sign in to use show chat.</p>
          )}
          {chatOn && (
            <p className="status-ok" style={{ marginTop: 6 }}>
              ✓ Chat block is in the JS ({chatMode}). Edit the field mapping in the marked region to match this graphic.
            </p>
          )}
        </div>
      )}

      {moderationOpen && <ModerationPanel onClose={() => setModerationOpen(false)} />}
    </div>
  );
}
