# src/templates/infoCards - the info cards

## infoCards/ - the card family

card01…card71 (prefix 'info-card', `dataRegion: true`). The standard contract's
other line-based family: they use the same 9-preset bank as lower thirds and convert exactly like
them, steps and all (a » press per body line becomes a middle step with its `reveals`).
Four jobs in one category: card01…card09 are INFORMATION cards (a heading with lines under it);
card10-card37 are the TITLE / TOPIC / INFORMATION pack (src/templates/pack4/AGENTS.md), each a thin variant
record over a shared per-type builder in `infoCards/pack4/`; card38-card49 are the COMMERCE
cards (product / offer / listing / QR / location / sponsor strips), which is why
`shared/standard.ts` exports **`maskLine`/`maskLines`** beside `lineMasksFor` - the generic
name/title/extra ladder gives every line past the second the same class, and a card whose lines
are a product name, a price and a struck-through was-price needs to name each one for what it
is; and card50…card58 are SET-PIECE cards whose layout carries a convention older than
television - a reading, a lyric (now + next), a quotation, a translation, an order of service,
and the ceremony cards; card59…card71 are the editorial/cinematic information-system siblings
(typed title, now/next, headline, notice and statement designs plus hand-authored results,
sponsor, caption and location shapes). On the commerce cards, values that could vary by shop, currency or
format are FIELDS and vanish with `:empty` when blank (the savings chip, the promo code, the
deadline, the status line, the unit mark) - no state, nothing for a replay to leak.
**The grid trap:** `cardLineMasks` wraps every line in a `.info-card-mask` div, so on a design
that lays the box out as a grid or flex container the ITEMS are the masks, not the `#fN` spans.
Placement rules target the masks (`.info-card-mask:nth-child(N)`), type rules target the spans -
see card57.
**The rail trap:** `.info-card-accent` is absolutely positioned at the root's left edge and the
box is painted AFTER it, so a design whose box has a BACKGROUND must reserve the strip
(`margin-left: var(--accent-weight)`) or the panel covers the rail completely (card56, card58).
A panel-less design (card01) needs only padding.
