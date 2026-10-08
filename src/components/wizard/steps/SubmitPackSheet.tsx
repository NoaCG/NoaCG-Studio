import { useMemo, useState } from 'react';
import WizardConfirm from '../WizardConfirm';
import { packSources } from '../../../community/packSources';
import {
  buildCommunityPack,
  checkPackGraphics,
  checkPackMeta,
  checkPackSize,
  type PackFinding,
} from '../../../community/packChecks';
import { submitPack } from '../../../community/packs';

/**
 * SUBMIT A PACK - the community shelf's giving half (docs/work-specs/community-packs/spec.md
 * AC-6, AC-7). One sheet: pick one of your folders or personal productions, keep the graphics
 * you want, name and describe the pack, choose the name it is shown under, read the checks and
 * the licence, Send for review. The checks run as the sheet changes; the primary stays off until
 * nothing refuses.
 */

/** What the checks refused, each naming its graphic - the sheet's list and the admin's review row. */
export function PackFindings({ findings, testid }: { findings: PackFinding[]; testid?: string }) {
  return (
    <ul className="wz-submit-findings" data-testid={testid}>
      {findings.map((f, i) => (
        <li key={i}>{f.graphic ? <><strong>{f.graphic}:</strong> {f.message}</> : f.message}</li>
      ))}
    </ul>
  );
}

interface Props {
  /** The name this maker chose on their previous pack - the only pre-fill allowed (D15). */
  lastAuthor: string;
  onClose: () => void;
  onSent: () => void;
}

export default function SubmitPackSheet({ lastAuthor, onClose, onSent }: Props) {
  const sources = useMemo(() => packSources(), []);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const source = sources.find((s) => s.id === sourceId) ?? null;
  const [off, setOff] = useState<Set<string>>(new Set());
  const [name, setName] = useState(sources[0]?.name ?? '');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState(lastAuthor);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const chosen = useMemo(() => (source?.graphics ?? []).filter((g) => !off.has(g.key)), [source, off]);
  // The gate parses every chosen graphic, so it runs when the SET changes, not on every keystroke.
  const graphicFindings = useMemo(() => checkPackGraphics(chosen), [chosen]);
  const findings: PackFinding[] = [...checkPackMeta({ name, description, author }), ...graphicFindings];

  const pick = (id: string) => {
    setSourceId(id);
    setOff(new Set());
    const next = sources.find((s) => s.id === id);
    if (next) setName(next.name);
  };

  const send = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const pack = await buildCommunityPack({ name, description, author, graphics: chosen });
      const tooBig = checkPackSize(JSON.stringify(pack));
      if (tooBig) throw new Error(tooBig.message);
      await submitPack({ name, description, author }, pack);
      onSent();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  return (
    <WizardConfirm
      title="Submit a pack"
      confirmLabel={busy ? 'Sending…' : 'Send for review'}
      confirmDisabled={busy || findings.length > 0}
      onConfirm={() => void send()}
      cancelLabel="Cancel"
      onCancel={onClose}
      testid="submit-pack"
    >
      {sources.length === 0 ? (
        <p>None of your folders or productions holds a graphic you made.</p>
      ) : (
        <>
          <label className="wz-submit-field">
            <span>Graphics from</span>
            <select value={sourceId} onChange={(e) => pick(e.target.value)} data-testid="submit-pack-source">
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kind === 'folder' ? 'Folder' : 'Production'}: {s.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="wz-submit-graphics" aria-label="Graphics in the pack">
            {source?.graphics.map((g) => (
              <li key={g.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={!off.has(g.key)}
                    onChange={() =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                  />
                  {g.name}
                </label>
              </li>
            ))}
          </ul>
          <label className="wz-submit-field">
            <span>Name</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="submit-pack-name" />
          </label>
          <label className="wz-submit-field">
            <span>Description</span>
            <input
              value={description}
              maxLength={200}
              placeholder="One line: what it is for"
              onChange={(e) => setDescription(e.target.value)}
              data-testid="submit-pack-description"
            />
          </label>
          <label className="wz-submit-field">
            <span>Shown as</span>
            <input
              value={author}
              maxLength={60}
              placeholder="Any name; it appears on the card"
              onChange={(e) => setAuthor(e.target.value)}
              data-testid="submit-pack-author"
            />
          </label>
          {/* The pack's own words show as empty fields; only what the checks found in the
              graphics needs saying. */}
          {graphicFindings.length > 0 && (
            <PackFindings findings={graphicFindings} testid="submit-pack-findings" />
          )}
          <p className="wz-confirm-warn">
            Submitting publishes this under CC BY 4.0. Anyone may use it in any show, with the name you
            chose. You confirm you have the right to share its fonts and images.
          </p>
          {failure && <p className="wz-community-error" role="alert">{failure}</p>}
        </>
      )}
    </WizardConfirm>
  );
}
