// Plans: what a group of accounts gets.
//
// The editor is built from the entitlement contract's own key lists, so a feature added to
// the product appears here without anyone remembering to add it - and a key that is not in
// the contract cannot be typed in, because there is no free text box for one.
//
// An empty allowance box means INHERIT, which is different from zero. The hint says so on
// every field, because getting that wrong is how a plan silently stops someone working.

import { useState } from 'react';
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS, OBSERVE_ONLY_LIMITS } from '../../entitlements/contract';
import type { FeatureKey, LimitKey } from '../../entitlements/contract';
import type { AdminPlan, AdminPlanListResponse, AdminSessionResponse } from '../types';
import { adminPost } from '../client';
import { AsyncState, Field, Pill, SectionHeader, Toggle, useAdminData } from '../ui';

function blankPlan(): AdminPlan {
  return {
    id: '',
    key: '',
    name: '',
    description: '',
    status: 'active',
    isDefault: false,
    features: {},
    limits: {},
    renderTier: 'free',
    autoAssignEmailDomains: [],
    renderFormats: null,
    billing: {},
    sortOrder: 0,
    assignedCount: 0,
  };
}

export function PlansSection({ session }: { session: AdminSessionResponse }) {
  const list = useAdminData<AdminPlanListResponse>('plans');
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [problem, setProblem] = useState('');
  const readOnly = session.role === 'support';

  async function save(plan: AdminPlan) {
    setProblem('');
    try {
      await adminPost('plans', { action: 'save', plan });
      setEditing(null);
      list.reload();
    } catch {
      setProblem('The plan was not saved. Check that the key is unique and lowercase.');
    }
  }

  async function act(action: string, id: string) {
    setProblem('');
    try {
      await adminPost('plans', { action, id });
      list.reload();
    } catch {
      setProblem('That change did not go through.');
    }
  }

  return (
    <section className="admin-section admin-section-wide">
      <SectionHeader
        title="Plans"
        lede="A plan is data: create, rename and retire them freely. Nothing in the product is hard-coded to a plan name."
        actions={
          readOnly ? null : (
            <button type="button" className="primary" onClick={() => setEditing(blankPlan())}>
              New plan
            </button>
          )
        }
      />

      {problem ? <p className="admin-problem">{problem}</p> : null}

      {list.data && list.data.plans.length > 0 ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Key</th>
              <th>Render tier</th>
              <th className="admin-num">Users</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.plans.map((plan) => (
              <tr key={plan.id} className={plan.status === 'archived' ? 'admin-row-dim' : ''}>
                <td>
                  {plan.name}
                  {plan.isDefault ? <Pill tone="ok">default</Pill> : null}
                  {/* A domain rule grants access to accounts that do not exist yet, so it
                      belongs in the LIST rather than one click inside the editor. */}
                  {plan.autoAssignEmailDomains.map((domain) => (
                    <Pill key={domain} tone="muted">@{domain}</Pill>
                  ))}
                  <div className="admin-muted">{plan.description}</div>
                </td>
                <td className="admin-mono">{plan.key}</td>
                <td>{plan.renderTier}</td>
                <td className="admin-num">{plan.assignedCount}</td>
                <td>{plan.status === 'archived' ? <Pill tone="muted">archived</Pill> : <Pill tone="ok">active</Pill>}</td>
                <td className="admin-actions">
                  {!readOnly ? (
                    <>
                      <button type="button" onClick={() => setEditing(plan)}>
                        Edit
                      </button>
                      {!plan.isDefault && plan.status === 'active' ? (
                        <button type="button" onClick={() => void act('set-default', plan.id)}>
                          Make default
                        </button>
                      ) : null}
                      {plan.status === 'active' ? (
                        <button type="button" onClick={() => void act('archive', plan.id)} disabled={plan.isDefault}>
                          Archive
                        </button>
                      ) : (
                        <button type="button" onClick={() => void act('restore', plan.id)}>
                          Restore
                        </button>
                      )}
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <AsyncState state={list} empty="No plans yet." />
      )}

      {editing ? (
        <PlanEditor
          plan={editing}
          tiers={list.data?.renderTiers ?? []}
          formats={list.data?.renderFormats ?? []}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </section>
  );
}

function PlanEditor({
  plan,
  tiers,
  formats,
  onCancel,
  onSave,
}: {
  plan: AdminPlan;
  tiers: string[];
  formats: string[];
  onCancel: () => void;
  onSave: (plan: AdminPlan) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AdminPlan>(plan);
  const patch = (next: Partial<AdminPlan>) => setDraft((current) => ({ ...current, ...next }));

  return (
    <aside className="admin-drawer" aria-label="Plan editor">
      <header className="admin-drawer-head">
        <h2>{plan.id ? `Edit ${plan.name}` : 'New plan'}</h2>
        <button type="button" onClick={onCancel} aria-label="Close">
          ✕
        </button>
      </header>

      <section className="admin-block">
        <Field label="Name">
          <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        </Field>
        <Field label="Key" hint="Lowercase letters, numbers and dashes. Used in the database, never shown to users.">
          <input
            value={draft.key}
            disabled={Boolean(plan.id)}
            onChange={(event) => patch({ key: event.target.value })}
          />
        </Field>
        <Field label="Description">
          <input value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
        </Field>
      </section>

      <section className="admin-block">
        <h3>Features</h3>
        <p className="admin-muted">
          Unticked is not the same as blocked: a feature this plan does not mention falls back to the built-in
          default. Untick to deny it explicitly.
        </p>
        {FEATURE_KEYS.map((key: FeatureKey) => (
          <Toggle
            key={key}
            label={FEATURE_LABELS[key]}
            checked={draft.features[key] ?? false}
            onChange={(next) => patch({ features: { ...draft.features, [key]: next } })}
          />
        ))}
      </section>

      <section className="admin-block">
        <h3>Who gets this plan automatically</h3>
        <p className="admin-muted">
          Email domains, one per line, without the <code>@</code>. Anyone signing in with an address at one
          of them inherits this plan when they have no plan assigned by hand - so a cohort does not have to
          be granted access one person at a time, and somebody who has not signed up yet is covered when
          they do. An explicit assignment, a grant, or a manual override still wins over this. One domain
          can only belong to one plan.
        </p>
        <Field label="Email domains" hint="Leave empty to assign this plan by hand only.">
          <textarea
            rows={3}
            value={draft.autoAssignEmailDomains.join('\n')}
            placeholder="northvale.edu"
            onChange={(event) =>
              patch({
                autoAssignEmailDomains: event.target.value
                  .split('\n')
                  .map((line) => line.trim().toLowerCase().replace(/^@+/, ''))
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </section>

      <section className="admin-block">
        <h3>Allowances</h3>
        {LIMIT_KEYS.map((key: LimitKey) => (
          <Field
            key={key}
            label={LIMIT_LABELS[key]}
            hint={
              OBSERVE_ONLY_LIMITS.has(key)
                ? 'Measured and shown, never enforced in this release.'
                : 'Empty inherits the server configuration.'
            }
          >
            <input
              type="number"
              min={0}
              value={draft.limits[key] ?? ''}
              placeholder="inherits"
              onChange={(event) =>
                patch({
                  limits: {
                    ...draft.limits,
                    [key]: event.target.value === '' ? null : Number(event.target.value),
                  },
                })
              }
            />
          </Field>
        ))}
      </section>

      <section className="admin-block">
        <h3>Rendering</h3>
        <Field label="Render tier" hint="The per-visitor caps in the render service: resolution, duration, concurrency.">
          <select value={draft.renderTier} onChange={(event) => patch({ renderTier: event.target.value })}>
            {tiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Output formats" hint="Leave all unticked to use whatever the tier already allows.">
          <div className="admin-checks">
            {formats.map((format) => (
              <Toggle
                key={format}
                label={format}
                checked={draft.renderFormats?.includes(format) ?? false}
                onChange={(next) => {
                  const current = new Set(draft.renderFormats ?? []);
                  if (next) current.add(format);
                  else current.delete(format);
                  patch({ renderFormats: current.size ? [...current] : null });
                }}
              />
            ))}
          </div>
        </Field>
        <p className="admin-note">
          Local export targets - SPX, CasparCG, OGraf, OBS, vMix, HTML - are free for everyone and cannot be
          restricted by a plan.
        </p>
      </section>

      <section className="admin-block">
        <h3>Billing</h3>
        <p className="admin-muted">Stored for a future payment integration. Nothing in the product reads these.</p>
        <Field label="Price (cents)">
          <input
            type="number"
            min={0}
            value={draft.billing.amountCents ?? ''}
            onChange={(event) =>
              patch({
                billing: {
                  ...draft.billing,
                  amountCents: event.target.value === '' ? undefined : Number(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Currency">
          <input
            value={draft.billing.currency ?? ''}
            placeholder="EUR"
            onChange={(event) => patch({ billing: { ...draft.billing, currency: event.target.value } })}
          />
        </Field>
        <Field label="Interval">
          <input
            value={draft.billing.interval ?? ''}
            placeholder="month"
            onChange={(event) => patch({ billing: { ...draft.billing, interval: event.target.value } })}
          />
        </Field>
      </section>

      <footer className="admin-drawer-foot">
        <button type="button" className="primary" onClick={() => void onSave(draft)}>
          Save plan
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </aside>
  );
}
