// The /join entry (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5). Three jobs and nothing else:
// read the capability out of the URL, build the Supabase audience provider from it, and mount
// the shared join surface. Every decision about what a viewer may see lives in
// `src/audience/joinSurface.ts` and in migration 0035's RPCs — this file is the door.
//
// TWO URL SHAPES, one entry:
//   /j/<name>         the short link a QR code and an on-air Join card carry
//   /join/<name>      the readable form links already in circulation use
//   /join?p=<slug>    the random form a production is published with
//   /join?pv=<slug>   the PRESENTER's own read-only view (its own slug, its own capability)
//   /join?rehearse=<production id>   a REHEARSAL phone for an unpublished production, in this
//                     browser only: it reads the production's local room (localAudience.ts), so it
//                     works offline and reaches no server (interaction spec AC-8, R15)

import { isBackendConfigured } from '../backend/config';
import { createSupabaseAudience, presenterBySlug } from '../audience/audienceData';
import { REHEARSE_PARAM, createLocalAudience, localRoomName } from '../audience/localAudience';
import type { AudienceBackend } from '../audience/audienceTypes';
import { deviceToken } from '../audience/deviceToken';
import { ensureJoinStyle, mountJoinSurface } from '../audience/joinSurface';
import { isSlug, joinSlugFrom } from './joinPath';
import { installE2eModules } from '../app/e2eModules';

// Browser specs reach this page's modules through window.__noacgImport (src/app/e2eModules.ts).
installE2eModules(null);

const root = document.getElementById('join');

function readSlug(): { join: string | null; presenter: string | null } {
  const params = new URLSearchParams(window.location.search);
  const presenter = params.get('pv');
  // /j/<name>, /join/<name> and /join?p=<slug> (joinPath.ts). `cleanUrls` and the vercel.json
  // rewrites serve this entry for each, and the dev/preview server does the same through the
  // app-clean-url plugin.
  return {
    join: joinSlugFrom(window.location.pathname, window.location.search),
    presenter: isSlug(presenter) ? presenter : null,
  };
}

/** One message for every reason there is nothing to show. A page that distinguished "no such
 *  production" from "not published" from "switched off" would be a probe for anyone holding a
 *  guessed link. */
function nothing(message = 'This link is not open right now.'): void {
  if (!root) return;
  // The stylesheet belongs to the join surface, and this page has two states that never mount it
  // — this message and the presenter view. Both shipped unstyled until it was asked for here.
  ensureJoinStyle(document);
  root.className = 'nj';
  root.textContent = '';
  const p = document.createElement('p');
  p.className = 'nj-waiting';
  p.textContent = message;
  root.appendChild(p);
}

async function showPresenter(slug: string): Promise<void> {
  if (!root) return;
  const paint = async () => {
    const view = await presenterBySlug(slug);
    if (!view) {
      nothing();
      return;
    }
    // Same stylesheet as the audience page — this view uses its class names, so without this it
    // renders as unstyled serif text against the left edge of the screen.
    ensureJoinStyle(document);
    root.className = 'nj';
    root.textContent = '';
    const title = document.createElement('p');
    title.className = 'nj-title';
    title.textContent = view.productionName;
    root.appendChild(title);
    // Two items, in the words that would go on air. No inbox, no counts, no controls: a
    // presenter's tablet is a read-only window onto what the operator has lined up. The labels
    // match the two buttons the producer presses (🎤 Now / ⇢ Next on the Audience tab), so the
    // two people can say the same word about the same thing.
    for (const [label, item] of [
      ['Now', view.current],
      ['Next', view.next],
    ] as const) {
      const card = document.createElement('div');
      card.className = 'nj-card';
      const heading = document.createElement('p');
      heading.className = 'nj-label';
      heading.textContent = label;
      const body = document.createElement('p');
      body.className = item ? 'nj-prompt' : 'nj-note';
      body.style.margin = '0';
      // An empty slot says it is empty. A dash reads as a rendering fault on a tablet held at
      // arm's length, and this is the one page nobody can ask about mid-show.
      body.textContent = item?.body || 'Nothing queued yet.';
      card.append(heading, body);
      if (item?.author) {
        const who = document.createElement('p');
        who.className = 'nj-note';
        who.textContent = item.author;
        card.appendChild(who);
      }
      root.appendChild(card);
    }
    const foot = document.createElement('p');
    foot.className = 'nj-note';
    foot.textContent = 'Read-only — this updates itself as the producer changes what is queued.';
    root.appendChild(foot);
  };
  await paint();
  // The presenter view is a monitor, so it refreshes on the same cadence as the join page and
  // stops asking while the tablet is asleep in a pocket.
  window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void paint();
  }, 5_000);
}

/** The join surface over a provider's viewer half, as this device. */
function mountPhone(backend: AudienceBackend): void {
  if (!root) return;
  const device = deviceToken();
  mountJoinSurface(root, {
    load: () => backend.joinView(device),
    submit: (author, body, target) => backend.submit(device, author, body, target),
    vote: (roundId, option, revision) => backend.vote(device, roundId, option, revision),
  });
}

function boot(): void {
  if (!root) return;
  const rehearse = new URLSearchParams(window.location.search).get(REHEARSE_PARAM);
  if (rehearse !== null) {
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(rehearse)) {
      nothing();
      return;
    }
    mountPhone(createLocalAudience({ productionName: localRoomName(rehearse), showId: rehearse }));
    return;
  }
  // An offline / self-hosted build has no audience plane at all. Say so plainly here rather
  // than showing a form that could never send anything.
  if (!isBackendConfigured()) {
    nothing('Audience participation needs the cloud backend. This build runs offline.');
    return;
  }
  const { join, presenter } = readSlug();
  if (presenter) {
    void showPresenter(presenter);
    return;
  }
  if (!join) {
    nothing();
    return;
  }
  mountPhone(createSupabaseAudience({ joinSlug: join }));
}

boot();
