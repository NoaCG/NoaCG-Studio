// One account, in full: what they get, why they get it, what they have used, and the
// controls that change any of it.
//
// The Access table is the reason this surface exists. Every row shows the resolved value AND
// the source that produced it - a plan, a temporary grant, a manual override, an
// instance-wide switch, or suspension - because "this user has AI" without "because you gave
// them a grant that expires on Friday" is the kind of half-answer that leads to the wrong fix.

import { useState } from 'react';
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS, OBSERVE_ONLY_LIMITS } from '../../entitlements/contract';
import type { EntitlementSource, EntitlementValue, FeatureKey, LimitKey } from '../../entitlements/contract';
import type { AdminPlan, AdminSessionResponse, AdminUserDetail } from '../types';
import { adminPost } from '../client';
import { Field, Pill, formatBytes, formatDate, formatDateTime, formatUsd, relative } from '../ui';

const SOURCE_TONE: Record<EntitlementSource, 'ok' | 'warn' | 'danger' | 'muted'> = {
  default: 'muted',
  plan: 'muted',
  grant: 'warn',
  override: 'warn',
  'env-override': 'warn',
  suspended: 'danger',
  disabled: 'danger',
};

const SOURCE_WORD: Record<EntitlementSource, string> = {
  default: 'Default',
  plan: 'Plan',
  grant: 'Grant',
  override: 'Override',
  'env-override': 'Env list',
  suspended: 'Suspended',
  disabled: 'Off',
};

function Why({ value }: { value: EntitlementValue<unknown> }) {
  return (
    <span className="admin-why" title={value.sourceLabel}>
      <Pill tone={SOURCE_TONE[value.source]}>{SOURCE_WORD[value.source]}</Pill>
      <span className="admin-why-label">{value.sourceLabel}</span>
      {value.expiresAt ? <em> until {formatDate(value.expiresAt)}</em> : null}
    </span>
  );
}

export function UserDetail({
  detail,
  plans,
  session,
  onChanged,
  onClose,
}: {
  detail: AdminUserDetail;
  plans: AdminPlan[];
  session: AdminSessionResponse;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [tab, setTab] = useState<'access' | 'usage' | 'activity'>('access');
  const readOnly = session.role === 'support';

  // Grants are shown next to the access they modify, so the detail call brings them and
  // there is no separate list endpoint to keep in sync.
  const grants = detail.grants;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setProblem('');
    try {
      await action();
      onChanged();
    } catch {
      // Every admin failure is the same refusal, so there is nothing more specific to say
      // than that it did not happen.
      setProblem('That change did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const suspended = detail.user.state === 'suspended';

  return (
    <aside className="admin-drawer" aria-label={`Account ${detail.user.email}`}>
      <header className="admin-drawer-head">
        <div>
          <h2>{detail.user.email || '(no email)'}</h2>
          <p className="admin-muted">
            Registered {formatDate(detail.user.createdAt)} · last seen {relative(detail.user.lastSignInAt)}
            {detail.user.pendingInvite ? ' · invite not yet accepted' : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="admin-drawer-status">
        {suspended ? <Pill tone="danger">Suspended</Pill> : <Pill tone="ok">Active</Pill>}
        <Pill tone="muted">{detail.access.planName}</Pill>
        {detail.user.isAdmin ? <Pill tone="warn">{detail.user.isAdmin}</Pill> : null}
        {detail.user.internal ? <Pill tone="muted">internal</Pill> : null}
        {detail.usage.atLimit.length ? <Pill tone="warn">at limit</Pill> : null}
      </div>

      {problem ? <p className="admin-problem">{problem}</p> : null}

      <nav className="admin-tabs">
        {(['access', 'usage', 'activity'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={id === tab ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {id[0].toUpperCase() + id.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'access' ? (
        <AccessTab
          detail={detail}
          plans={plans}
          grants={grants}
          busy={busy}
          readOnly={readOnly}
          run={run}
        />
      ) : null}

      {tab === 'usage' ? <UsageTab detail={detail} /> : null}

      {tab === 'activity' ? (
        <ol className="admin-activity">
          {detail.recentActivity.length === 0 ? <li className="admin-muted">No recent activity.</li> : null}
          {detail.recentActivity.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <time>{formatDateTime(entry.at)}</time>
              <Pill tone="muted">{entry.kind}</Pill>
              <span>{entry.summary}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {!readOnly ? (
        // Marking an account internal changes NOTHING about what it may do - it moves that
        // account's rows out of the default usage scope so the dashboard reports other people
        // (migration 0027). One click, no arming step: it grants nothing, withdraws nothing,
        // and is trivially reversible, which is the opposite of the suspension below it.
        <div className="admin-internal-mark">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={detail.user.internal}
              disabled={busy}
              onChange={(event) =>
                void run(() =>
                  adminPost('user', {
                    id: detail.user.id,
                    action: 'set-internal',
                    internal: event.target.checked,
                  }),
                )
              }
            />
            <span>
              This is one of our own accounts
              <em>
                Development, testing or a demo. Excluded from the default “Other people” scope on
                Overview, Usage and Feedback — and from nothing else: it is not a role and grants
                no access.
              </em>
            </span>
          </label>
        </div>
      ) : null}

      {!readOnly ? (
        <SuspendControl
          suspended={suspended}
          busy={busy}
          onConfirm={(reason) =>
            void run(() =>
              adminPost('user', {
                id: detail.user.id,
                action: suspended ? 'reactivate' : 'suspend',
                reason,
              }),
            )
          }
        />
      ) : null}
    </aside>
  );
}

/** Suspension, behind a deliberate second step.
 *
 *  A native confirm() would be one keystroke away from being dismissed by muscle memory, and
 *  it cannot carry the reason field - which the audit log wants and which is the thing the
 *  next operator will actually need. So the button ARMS a small form rather than acting, and
 *  reactivation (harmless, reversible) stays a single click. */
function SuspendControl({
  suspended,
  busy,
  onConfirm,
}: {
  suspended: boolean;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState('');

  if (suspended) {
    return (
      <footer className="admin-drawer-foot">
        <button type="button" className="primary" disabled={busy} onClick={() => onConfirm('')}>
          Reactivate account
        </button>
        <span className="admin-muted">
          Database writes are blocked now. An access token already issued can still read for up to an hour.
        </span>
      </footer>
    );
  }

  return (
    <footer className="admin-drawer-foot">
      {arming ? (
        <>
          <input
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this account being suspended?"
            aria-label="Reason for suspending"
          />
          <button
            type="button"
            className="danger"
            disabled={busy || !reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setArming(false);
              setReason('');
            }}
          >
            Confirm suspension
          </button>
          <button type="button" disabled={busy} onClick={() => setArming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="danger" disabled={busy} onClick={() => setArming(true)}>
            Suspend account
          </button>
          <span className="admin-muted">Blocks writes and uploads at once. Their saved work stays readable.</span>
        </>
      )}
    </footer>
  );
}

function AccessTab({
  detail,
  plans,
  grants,
  busy,
  readOnly,
  run,
}: {
  detail: AdminUserDetail;
  plans: AdminPlan[];
  grants: AdminUserDetail['grants'];
  busy: boolean;
  readOnly: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [grantKey, setGrantKey] = useState<string>(FEATURE_KEYS[0]);
  const [grantValue, setGrantValue] = useState('true');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [grantReason, setGrantReason] = useState('');

  const isQuota = (LIMIT_KEYS as readonly string[]).includes(grantKey);
  const assignable = plans.filter((plan) => plan.status === 'active');
  const currentPlan = assignable.find((plan) => plan.name === detail.access.planName);

  return (
    <>
      <section className="admin-block">
        <h3>Plan</h3>
        <div className="admin-row">
          <select
            value={currentPlan?.id ?? ''}
            disabled={readOnly || busy}
            onChange={(event) =>
              void run(() =>
                adminPost('user', {
                  id: detail.user.id,
                  action: 'assign-plan',
                  planId: event.target.value || null,
                }),
              )
            }
          >
            <option value="">Default (no plan assigned)</option>
            {assignable.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          {detail.access.planExpiresAt ? (
            <span className="admin-muted">expires {formatDate(detail.access.planExpiresAt)}</span>
          ) : null}
        </div>
      </section>

      <section className="admin-block">
        <h3>Features</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Access</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_KEYS.map((key: FeatureKey) => (
              <tr key={key}>
                <td>{FEATURE_LABELS[key]}</td>
                <td>
                  {detail.access.features[key].value ? <Pill tone="ok">yes</Pill> : <Pill tone="muted">no</Pill>}
                </td>
                <td>
                  <Why value={detail.access.features[key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-block">
        <h3>Allowances</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Allowance</th>
              <th>Value</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {LIMIT_KEYS.map((key: LimitKey) => (
              <tr key={key}>
                <td>
                  {LIMIT_LABELS[key]}
                  {OBSERVE_ONLY_LIMITS.has(key) ? <em className="admin-muted"> · not enforced</em> : null}
                </td>
                <td>
                  {detail.access.limits[key].value === null ? (
                    <span className="admin-muted">inherits</span>
                  ) : (
                    <strong>{detail.access.limits[key].value}</strong>
                  )}
                </td>
                <td>
                  <Why value={detail.access.limits[key]} />
                </td>
              </tr>
            ))}
            <tr>
              <td>Render tier</td>
              <td>
                <strong>{detail.access.renderTier.value}</strong>
              </td>
              <td>
                <Why value={detail.access.renderTier} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="admin-block">
        <h3>Grants and overrides</h3>
        {grants.length === 0 ? <p className="admin-muted">None.</p> : null}
        {grants.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>What</th>
                <th>Value</th>
                <th>Ends</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grants.map((entry) => (
                <tr key={entry.id} className={entry.revokedAt ? 'admin-row-dim' : ''}>
                  <td>
                    {entry.kind === 'feature'
                      ? (FEATURE_LABELS[entry.key as FeatureKey] ?? entry.key)
                      : (LIMIT_LABELS[entry.key as LimitKey] ?? entry.key)}
                  </td>
                  <td>{String(entry.value)}</td>
                  <td>{entry.revokedAt ? `revoked ${formatDate(entry.revokedAt)}` : entry.expiresAt ? formatDate(entry.expiresAt) : 'permanent'}</td>
                  <td className="admin-muted">{entry.reason || '-'}</td>
                  <td>
                    {!entry.revokedAt && !readOnly ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => adminPost('grants', { action: 'revoke', id: entry.id }))}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {!readOnly ? (
          <div className="admin-grant-form">
            <Field label="Feature or allowance">
              <select value={grantKey} onChange={(event) => setGrantKey(event.target.value)}>
                <optgroup label="Features">
                  {FEATURE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {FEATURE_LABELS[key]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Allowances">
                  {LIMIT_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {LIMIT_LABELS[key]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Value">
              {isQuota ? (
                <input
                  type="number"
                  min={0}
                  value={grantValue}
                  onChange={(event) => setGrantValue(event.target.value)}
                />
              ) : (
                <select value={grantValue} onChange={(event) => setGrantValue(event.target.value)}>
                  <option value="true">Allow</option>
                  <option value="false">Deny</option>
                </select>
              )}
            </Field>
            <Field label="Ends" hint="Leave empty for a permanent override.">
              <input type="date" value={grantExpiry} onChange={(event) => setGrantExpiry(event.target.value)} />
            </Field>
            <Field label="Reason">
              <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Support case, school grant, abuse…" />
            </Field>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await adminPost('grants', {
                    action: 'create',
                    userId: detail.user.id,
                    kind: isQuota ? 'quota' : 'feature',
                    key: grantKey,
                    value: isQuota ? Number(grantValue) : grantValue === 'true',
                    // A date input gives a day; the server wants an instant, and end-of-day is
                    // what an operator means by "until the 5th".
                    expiresAt: grantExpiry ? new Date(`${grantExpiry}T23:59:59Z`).toISOString() : null,
                    reason: grantReason,
                  });
                  setGrantReason('');
                  setGrantExpiry('');
                })
              }
            >
              Add
            </button>
          </div>
        ) : null}
      </section>

      {!readOnly ? (
        <section className="admin-block">
          <h3>Allowance top-up</h3>
          <p className="admin-muted">
            Adds a 24-hour daily AI allowance. The ledger is never edited, so the accounting stays true and
            the reason is recorded.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                adminPost('user', { id: detail.user.id, action: 'reset-allowance', amount: 10, reason: 'support top-up' }),
              )
            }
          >
            Give 10 more generations today
          </button>
        </section>
      ) : null}
    </>
  );
}

function UsageTab({ detail }: { detail: AdminUserDetail }) {
  const usage = detail.usage;
  const stats: [string, string][] = [
    ['AI generations (30 d)', String(usage.aiGenerations30d)],
    ['Delivered', String(usage.aiSuccesses30d)],
    ['Failed', String(usage.aiFailures30d)],
    ['AI cost (30 d)', formatUsd(usage.aiCostUsd30d)],
    ['Started today', String(usage.aiGenerationsToday)],
    ['Renders (30 d)', String(usage.renderJobs30d)],
    ['Saved projects', String(usage.documents)],
    ['Cloud storage', formatBytes(usage.storageBytes)],
  ];
  return (
    <section className="admin-block">
      <dl className="admin-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {usage.atLimit.length ? (
        <p className="admin-problem">
          Currently at: {usage.atLimit.map((key) => LIMIT_LABELS[key]).join(', ')}.
        </p>
      ) : (
        <p className="admin-muted">Not currently limited.</p>
      )}
    </section>
  );
}
