import { useEffect, useRef, useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { addLook } from '../model/packets';
import type { ProjectBrand } from '../model/brand';
import {
  getCommunity,
  listCommunity,
  reportTemplate,
  type CommunityCard,
  type CommunityItem,
  type CommunityKind,
} from '../community/communityData';
import { publishGate } from '../community/gate';
import { CATEGORIES } from '../model/wizard';
import type { SpxTemplate } from '../model/types';
import { useModalGate } from './spaceKey';
import { useMyEntitlement } from './useMyEntitlement';

interface Props {
  onClose: () => void;
  /** When arriving via a `?template=<slug>` share link, this item is fetched and shown up top. */
  initialSlug?: string | null;
}

type Filter = 'all' | CommunityKind;

/**
 * The community gallery (Era 5.5): browse the approved templates + looks other signed-in users
 * published before it closed to publishing (migration 0078, read-only since), and import a COPY into
 * your own work. "Use" re-runs the SAME automated gate on the fetched
 * body before it touches your local project (defence-in-depth), so a bad row can never inject a broken
 * or unsafe template. Only rendered when a backend is configured; the offline app never mounts it.
 */
export default function CommunityGallery({ onClose, initialSlug }: Props) {
  useModalGate(); // global editor shortcuts stand down while this is up
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);

  const [cards, setCards] = useState<CommunityCard[]>([]);
  const [featured, setFeatured] = useState<CommunityItem | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Only close on a backdrop click whose press began there, so a drag-select never dismisses.
  // See save/SaveDialogs.tsx.
  const pressedOnBackdrop = useRef(false);
  const hiddenTemplates = useMyEntitlement().hiddenTemplates;

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      const list = await listCommunity(filter === 'all' ? undefined : filter);
      // A published template an admin marked beta, internal or hidden is dropped for a
      // visitor who is not entitled to it (docs/ADMIN.md §7). The browse RPC already hides
      // anything not 'approved'; this is the second, admin-driven axis on top of moderation.
      const hidden = new Set(hiddenTemplates);
      const visible = hidden.size ? list.filter((card) => !hidden.has(card.slug)) : list;
      if (alive) {
        setCards(visible);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, hiddenTemplates]);

  useEffect(() => {
    if (!initialSlug) return;
    let alive = true;
    void (async () => {
      const item = await getCommunity(initialSlug);
      if (alive && item) setFeatured(item);
    })();
    return () => {
      alive = false;
    };
  }, [initialSlug]);

  /** Import an already-fetched item into local work (the import-time gate lives here). */
  const importItem = (item: CommunityItem): boolean => {
    if (item.kind === 'graphic') {
      const template = item.body as SpxTemplate;
      const gate = publishGate(template);
      if (!gate.ok) {
        setNote(`Can't use “${item.name}”: ${gate.errors[0]?.message ?? 'it failed the safety check.'}`);
        return false;
      }
      applyTemplate(template, { resetSampleData: true });
      setActiveTab('html');
      return true;
    }
    const body = item.body as { name?: string; brand?: ProjectBrand };
    const brand = body.brand;
    if (!brand?.palette?.accent || !brand.styleTag) {
      setNote(`“${item.name}” isn't a valid look.`);
      return false;
    }
    addLook(body.name || item.name, brand);
    setNote(`✓ Imported look “${item.name}” — find it under Home ▸ Brand looks.`);
    return false; // a look import doesn't replace the editor, so keep the gallery open
  };

  const onUse = async (card: CommunityCard) => {
    setBusy(true);
    const item = await getCommunity(card.slug);
    setBusy(false);
    if (!item) {
      setNote('That template is no longer available.');
      return;
    }
    if (importItem(item)) onClose(); // a graphic loaded into the editor — close the gallery
  };

  const onReport = async (id: string, name: string) => {
    const reason = window.prompt(`Report “${name}” to the moderators. What's wrong with it?`);
    if (!reason) return;
    const { error } = await reportTemplate(id, reason);
    setNote(error ?? '✓ Reported — thanks. A moderator will take a look.');
  };

  // The stored category is the ASSEMBLER id (`template.type` at publish — a routing id the
  // root contract says is never rendered in UI). Show the human wizard label instead; an id
  // no registry knows (an older build's, or a future one's) shows nothing rather than jargon.
  const categoryLabel = (raw: string | null | undefined): string | null =>
    raw ? (CATEGORIES.find((k) => k.id === raw)?.name ?? null) : null;

  const card = (c: CommunityCard, isFeatured = false) => (
    <div className="pk-graphic" key={c.id} style={isFeatured ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : undefined}>
      <strong>{c.name}</strong>
      <span className="muted">
        {c.kind}
        {categoryLabel(c.category) ? ` · ${categoryLabel(c.category)}` : ''} · {c.author_name || 'anonymous'}
      </span>
      {c.summary && <span className="hint" style={{ flexBasis: '100%', order: 9 }}>{c.summary}</span>}
      <div className="spacer" />
      <button className="primary" onClick={() => void onUse(c)} disabled={busy} title="Import a copy into your work">
        Use
      </button>
      <button onClick={() => void onReport(c.id, c.name)} title="Report to moderators">⚑</button>
    </div>
  );

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="wz-modal pk-modal">
        <div className="wz-header">
          <div>
            <h2>🌐 Community</h2>
            <p className="hint">Templates and looks shared by other users. “Use” imports a copy into your own project.</p>
          </div>
          <button className="gallery-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="pk-body">
          <div className="row">
            {(['all', 'graphic', 'look'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'graphic' ? 'Graphics' : 'Looks'}
              </button>
            ))}
          </div>

          {featured && (
            <div className="panel-section">
              <h3 style={{ marginTop: 0 }}>Shared with you</h3>
              {card(featured, true)}
            </div>
          )}

          <div className="panel-section">
            {loading ? (
              <p className="hint">Loading…</p>
            ) : cards.length === 0 ? (
              // Publishing is closed (migration 0078), so there is no door to point at.
              <p className="hint">Nothing here yet.</p>
            ) : (
              cards.map((c) => card(c))
            )}
          </div>

          {note && (
            <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} style={{ marginTop: 4 }}>{note}</p>
          )}
        </div>
      </div>
    </div>
  );
}
