import { useEffect, useMemo, useRef, useState } from 'react';
import {
  discoverAiModels,
  modelCostLabel,
  modelPriceLabel,
  videoCompatibleModels,
  type AiDiscoveredModel,
} from '../ai/modelCatalog';
import {
  AI_PROVIDERS,
  DEFAULT_PROVIDER,
  credentialNoun,
  deleteUserAiKey,
  isByokProvider,
  modelsForProvider,
  refreshAiConfiguration,
  saveUserAiKey,
  type AiProviderStatus,
  type AiSettings,
} from '../ai/settings';

interface Props {
  settings: AiSettings;
  onChange: (patch: Partial<AiSettings>) => void;
  /**
   * Whether the NoaCG-funded default route may be chosen here. True (the default) for the
   * surfaces that legitimately run on it - the video harness and app Settings - and FALSE on
   * the bring-your-own-key tier, whose entire promise is that the user's own key pays.
   *
   * The option it adds names no vendor and no gateway: which transport NoaCG reaches a model
   * through is our business, not a product decision a user makes (src/ai/modelTypes.ts).
   */
  allowManaged?: boolean;
}

/** The managed route as the ONE neutral row a picker may show for it. */
const MANAGED_OPTION = {
  label: 'NoaCG (no key needed)',
  blurb: 'Runs on NoaCG’s own account — no key of your own needed.',
};

/** Shared provider/model/key controls. The secret input is submitted once and never persisted in app settings. */
export default function AiProviderSettings({ settings, onChange, allowManaged = true }: Props) {
  const onChangeRef = useRef(onChange);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<AiProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [discovered, setDiscovered] = useState<AiDiscoveredModel[]>([]);
  const provider = settings.provider;
  const managedSelected = !isByokProvider(provider);
  const curatedModels = useMemo(() => modelsForProvider(provider), [provider]);
  const current = status.find((p) => p.id === provider);
  const selectedDiscovered = discovered.find((model) => model.id === settings.model);
  const providerLabel = AI_PROVIDERS.find((p) => p.id === provider)?.label
    ?? (managedSelected ? MANAGED_OPTION.label : provider);
  // Each provider's OWN word for the credential it issues - Hugging Face has no API keys, only
  // user access tokens, and asking for the wrong thing sends people looking for a page that
  // does not exist.
  const noun = credentialNoun(provider);
  /* WHICH CREDENTIAL PAYS, in the model row's own hint. The discovery rows carry it per model;
     this says it once for the model actually selected, including the honest third state - a
     route nobody has one for yet. It LEADS the hint rather than trailing it: the sentence after
     it is either a price or a blurb, both of which already end in their own punctuation. */
  const payerSentence = managedSelected || (!current?.userKey && current?.managedKey)
    ? 'Included with NoaCG.'
    : current?.userKey
      ? `Charged to your ${providerLabel} ${noun}.`
      : `Needs your ${providerLabel} ${noun}.`;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let live = true;
    void refreshAiConfiguration()
      .then((config) => {
        if (!live) return;
        setStatus(config.providers);
        onChangeRef.current({
          configuredProviders: config.providers.filter((provider) => provider.available).map((provider) => provider.id),
          keyStorageAvailable: config.keyStorageAvailable,
        });
      })
      .catch(() => {
        if (live) setMessage('Could not read server AI configuration.');
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setDiscovered([]);
    // EVERY provider is discovered now, not just the two gateways: a bring-your-own-key user
    // is choosing among the models their key can actually reach, and the server answers with
    // an empty list (never an error) where it has no listing or no key to list with.
    void discoverAiModels(provider)
      .then((catalog) => {
        if (live) setDiscovered(videoCompatibleModels(catalog.models));
      })
      .catch(() => {
        if (live) setMessage('Live model discovery is unavailable. You can still enter a model id.');
      });
    return () => { live = false; };
  }, [provider]);

  const applyConfig = (config: Awaited<ReturnType<typeof refreshAiConfiguration>>) => {
    setStatus(config.providers);
    onChange({
      configuredProviders: config.providers.filter((provider) => provider.available).map((provider) => provider.id),
      keyStorageAvailable: config.keyStorageAvailable,
    });
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      await saveUserAiKey(provider, key);
      setKey('');
      applyConfig(await refreshAiConfiguration());
      setMessage(`Your ${providerLabel} ${noun} is stored securely.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not store the ${noun}.`);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    setMessage('');
    try {
      await deleteUserAiKey(provider);
      applyConfig(await refreshAiConfiguration());
      setMessage(`Your ${providerLabel} ${noun} was removed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not remove the ${noun}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    /* Label column | control column (re-design/handoff.md §6). The key row's button nests its
       own grid inside the control cell, so "Store key" can never wrap under the field. */
    <div className="dlg-rows">
      <div className="dlg-row">
        <label htmlFor="ai-provider">Provider</label>
        <select
          id="ai-provider"
          value={settings.provider}
          onChange={(event) => {
            setKey('');
            setMessage('');
            onChange({ provider: event.target.value as AiSettings['provider'] });
          }}
        >
          {/* The managed route is listed only where it is allowed, and ALWAYS while it is the
              stored one - a select whose value matches no option silently shows a different
              provider than the one that will run. */}
          {(allowManaged || managedSelected) && (
            <option value={DEFAULT_PROVIDER} title={MANAGED_OPTION.blurb}>{MANAGED_OPTION.label}</option>
          )}
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} title={p.blurb}>{p.label}</option>
          ))}
        </select>
        <p className="dlg-hint">
          {managedSelected
            ? MANAGED_OPTION.blurb
            : AI_PROVIDERS.find((p) => p.id === settings.provider)?.blurb}
        </p>
      </div>

      <div className="dlg-row">
        <label htmlFor="ai-model">Model</label>
        <input
          id="ai-model"
          className="mono"
          list={`ai-models-${provider}`}
          value={settings.model}
          onChange={(event) => onChange({ model: event.target.value.trim() })}
          placeholder="Provider model id"
        />
        {/* EVERY ROW CARRIES ITS PRICE AND WHO PAYS IT (owner, 2026-08-14). A curated
            fallback row - shown only where live discovery could not answer - says so in the
            same slot rather than silently omitting the number, because a row with no price
            beside rows that have one reads as free. */}
        <datalist id={`ai-models-${provider}`} data-testid="ai-model-options">
          {discovered.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} - {modelCostLabel(model)}
            </option>
          ))}
          {curatedModels
            .filter((model) => !discovered.some((item) => item.id === model.id))
            .map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} - price unavailable
              </option>
            ))}
        </datalist>
        <p className="dlg-hint" data-testid="ai-model-cost">
          {`${payerSentence} ${
            selectedDiscovered
              ? `${selectedDiscovered.contextLength?.toLocaleString() ?? 'Unknown'} context - ${
                  selectedDiscovered.inputModalities.join(', ')
                } input - ${modelPriceLabel(selectedDiscovered)}`
              : curatedModels.find((model) => model.id === settings.model)?.blurb
                ?? 'Any model id supported by this provider.'
          }`}
        </p>
      </div>

      {/* NO KEY ROW ON THE MANAGED ROUTE. A customer is never asked for a key to reach NoaCG's
          own models or harness (owner, 2026-08-14) - that route runs on our service or it is
          not offered. A key belongs to the user's OWN provider, which is the only case this
          row exists for. */}
      {!managedSelected && (
      <div className="dlg-row">
        <label htmlFor="ai-user-key">{`${providerLabel} ${noun}`}</label>
        <div className="dlg-pair">
          <input
            id="ai-user-key"
            type="password"
            autoComplete="off"
            placeholder={`Paste your ${providerLabel} ${noun}`}
            value={key}
            disabled={busy || settings.keyStorageAvailable === false}
            onChange={(event) => setKey(event.target.value)}
          />
          <span className="row" style={{ gap: 8 }}>
            <button disabled={busy || !key.trim()} onClick={() => void saveKey()}>
              {noun === 'token' ? 'Store token' : 'Store key'}
            </button>
            {current?.userKey && <button disabled={busy} onClick={() => void removeKey()}>Remove</button>}
          </span>
        </div>
        <p className="dlg-hint">
          {settings.keyStorageAvailable === false
            ? `This server has not configured encrypted storage for your own ${noun}.`
            : current?.userKey
              ? `Your ${noun} is stored in an encrypted HttpOnly cookie. It cannot be read by the app.`
              : `The ${noun} is sent once to this server and is never saved in browser-readable storage.${
                  noun === 'token' ? ' It needs the “Inference Providers” permission.' : ''
                }`}
        </p>
      </div>
      )}
      {/* Outside the key row on purpose: a discovery or configuration failure has to be
          readable on the managed route too, where there is no key row to carry it. */}
      {message && <p className="dlg-hint" role="status">{message}</p>}
    </div>
  );
}
