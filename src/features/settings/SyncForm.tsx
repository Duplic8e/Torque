import { useState } from 'preact/hooks';
import { Field } from '../../core/components/Fields';
import { getSync } from '../../sync';
import { SyncError, type SyncConfig } from '../../sync/types';

interface Props {
  /** settings: connect an existing install. onboarding: validate now, connect when setup finishes. restore: pull a new phone's data. */
  mode: 'settings' | 'onboarding' | 'restore';
  /** onboarding only: the validated config, or null while the fields are being edited. */
  onReady?: (config: SyncConfig | null) => void;
}

const messageOf = (e: unknown) => (e instanceof SyncError ? e.message : 'Something went wrong. Try again.');

export function SyncForm({ mode, onReady }: Props) {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('torque-data');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [offerMerge, setOfferMerge] = useState(false);

  const config = (): SyncConfig => ({ owner: owner.trim(), repo: repo.trim(), token: token.trim() });
  const filled = owner.trim() !== '' && repo.trim() !== '' && token.trim() !== '';

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setNote('');
    setError('');
    setOfferMerge(false);
    onReady?.(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'has_data' && mode === 'settings') setOfferMerge(true);
      else setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const test = () =>
    run(async () => {
      const { hasData } = await getSync().inspect(config());
      if (mode === 'onboarding') {
        if (hasData) {
          onReady?.(null);
          return setError('That repository already has Torque data. Go back to the welcome screen and choose “Restore from GitHub”, or use an empty repository.');
        }
        onReady?.(config());
        return setNote('Connected. Sync will start when you finish setup.');
      }
      setNote(hasData ? 'Connected (private). This repository already has Torque data.' : 'Connected (private repository).');
    });

  const connect = (allowExistingData: boolean) =>
    run(async () => {
      await getSync().connect(config(), { allowExistingData });
      setToken('');
    });

  const restore = () =>
    run(async () => {
      await getSync().restore(config());
      void getSync().syncNow();
    });

  return (
    <div>
      <Field label="GitHub username">
        <input class="input" type="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" value={owner}
          onInput={(e) => edit(setOwner)((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      <Field label="Data repository">
        <input class="input" type="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" value={repo}
          onInput={(e) => edit(setRepo)((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      <Field label="Access token">
        <input class="input" type="password" autoCapitalize="none" autoCorrect="off" autoComplete="off" value={token}
          onInput={(e) => edit(setToken)((e.currentTarget as HTMLInputElement).value)} />
      </Field>

      <div class="row">
        {mode !== 'restore' && <button type="button" class="btn btn-secondary" disabled={!filled || busy} onClick={() => void test()}>Test connection</button>}
        {mode === 'settings' && <button type="button" class="btn btn-primary" disabled={!filled || busy} onClick={() => void connect(false)}>Connect</button>}
        {mode === 'restore' && <button type="button" class="btn btn-primary" disabled={!filled || busy} onClick={() => void restore()}>Restore from GitHub</button>}
      </div>

      {offerMerge && (
        <div class="warning" role="alert">
          <p>That repository already has Torque data. Merge it with the data on this device? The newest version of each record wins.</p>
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void connect(true)}>Merge and connect</button>
        </div>
      )}
      {busy && <p class="muted" role="status">Working…</p>}
      {note && <p role="status">{note}</p>}
      {error && <p class="error" role="alert">{error}</p>}
    </div>
  );
}
