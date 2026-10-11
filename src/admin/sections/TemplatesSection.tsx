// Template administration: whether a design is ready for everyone yet.
//
// Visibility only. There is deliberately no way to put a template behind a plan: the catalog
// is free-forever core and works offline, where no entitlement can be checked, so a paywall
// here would be both unenforceable and a contradiction of the product's promise. What an
// operator does need is a way to say "this one is beta", "this one is internal", and "take
// this one down", which is what these four states are.

import { useState } from 'react';
import type { AdminSessionResponse, AdminTemplateEntry, AdminTemplateListResponse, TemplateVisibility } from '../types';
import { adminPost } from '../client';
import { AsyncState, Pill, SectionHeader, useAdminData } from '../ui';

const VISIBILITIES: { id: TemplateVisibility; label: string; hint: string }[] = [
  { id: 'public', label: 'Public', hint: 'Everyone sees it.' },
  { id: 'beta', label: 'Beta', hint: 'Only the beta cohort sees it.' },
  { id: 'internal', label: 'Internal', hint: 'Only admins see it.' },
  { id: 'hidden', label: 'Hidden', hint: 'Nobody sees it. Existing graphics keep working.' },
];

const TONE: Record<TemplateVisibility, 'ok' | 'warn' | 'danger' | 'muted'> = {
  public: 'ok',
  beta: 'warn',
  internal: 'warn',
  hidden: 'danger',
};

export function TemplatesSection({ session }: { session: AdminSessionResponse }) {
  const list = useAdminData<AdminTemplateListResponse>('templates');
  const [adding, setAdding] = useState('');
  const [problem, setProblem] = useState('');
  const readOnly = session.role === 'support';

  async function set(entry: Pick<AdminTemplateEntry, 'key' | 'source'>, visibility: TemplateVisibility) {
    setProblem('');
    try {
      // Public is the default and needs no row, so choosing it removes the overlay instead of
      // storing a row that says "normal".
      if (visibility === 'public') await adminPost('templates', { action: 'clear', key: entry.key });
      else await adminPost('templates', { action: 'set', key: entry.key, source: entry.source, visibility });
      list.reload();
    } catch {
      setProblem('That change did not go through.');
    }
  }

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Templates"
        lede="Visibility for catalog designs. Templates are never put behind a plan."
      />
      {problem ? <p className="admin-problem">{problem}</p> : null}

      {list.data?.usageUnavailable ? (
        <p className="admin-problem">
          Per-template usage is not recorded. The creation event stores which <em>door</em> a graphic came through -
          catalog, AI, import, blank, kit, video - and never which design was picked, so there is no count to show.
          The column reads “-” rather than zero, because a zero here would say nobody used the template.
        </p>
      ) : null}

      {!readOnly ? (
        <form
          className="admin-invite"
          onSubmit={(event) => {
            event.preventDefault();
            const key = adding.trim();
            if (!key) return;
            void set({ key, source: 'catalog' }, 'beta').then(() => setAdding(''));
          }}
        >
          <input
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="Catalog template id, e.g. lt01"
            aria-label="Catalog template id"
          />
          <button type="submit">Mark as beta</button>
          <span className="admin-muted">
            Catalog designs live in code, so they appear here once their visibility has been changed.
          </span>
        </form>
      ) : null}

      {list.data && list.data.templates.length > 0 ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Source</th>
              <th>Visibility</th>
              <th className="admin-num">Uses</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {list.data.templates.map((entry) => (
              <tr key={`${entry.source}:${entry.key}`}>
                <td>
                  <span className="admin-mono">{entry.key}</span>
                </td>
                <td>{entry.source}</td>
                <td>
                  {readOnly ? (
                    <Pill tone={TONE[entry.visibility]}>{entry.visibility}</Pill>
                  ) : (
                    <select
                      value={entry.visibility}
                      onChange={(event) => void set(entry, event.target.value as TemplateVisibility)}
                      aria-label={`Visibility for ${entry.key}`}
                    >
                      {VISIBILITIES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="admin-num">{list.data?.usageUnavailable ? '-' : entry.uses}</td>
                <td className="admin-muted">{entry.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <AsyncState state={list} empty="Every template is public. Nothing has been restricted." />
      )}

      <dl className="admin-legend">
        {VISIBILITIES.map((option) => (
          <div key={option.id}>
            <dt>
              <Pill tone={TONE[option.id]}>{option.label}</Pill>
            </dt>
            <dd>{option.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
