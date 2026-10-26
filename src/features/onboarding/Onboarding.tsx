import { useRef, useState } from 'preact/hooks';
import { DateInput, Field, Segmented, TextInput } from '../../core/components/Fields';
import { InstallHint } from '../../core/components/InstallHint';
import { NumberInput } from '../../core/components/NumberInput';
import { todayLocal } from '../../core/dates';
import { exportToDump } from '../../data/backup-io';
import { parseExport } from '../../engine/backup';
import { runOnboarding, type ServiceAnswer } from '../../data/onboarding';
import type { Repo } from '../../data/repo';
import { CORE_ITEM_KEYS, CX5_TURBO_SEED } from '../../data/seed-cx5-turbo';
import type { Vehicle } from '../../data/types';
import { getSync } from '../../sync';
import type { SyncConfig } from '../../sync/types';
import { SyncForm } from '../settings/SyncForm';

type Mode = ServiceAnswer['mode'];
interface Answer {
  mode: Mode;
  date: string;
  odometer: number | undefined;
}

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
const STEPS = ['welcome', 'vehicle', 'odometer', 'style', 'services', 'sync'] as const;
const NAMES = Object.fromEntries(CX5_TURBO_SEED.map((r) => [r.key, r.name]));

export function Onboarding({ repo }: { repo: Repo }) {
  const today = todayLocal();
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(2023);
  const [nickname, setNickname] = useState('CX-5');
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [units, setUnits] = useState<Vehicle['units']>('mi');
  const [odometer, setOdometer] = useState<number>();
  const [style, setStyle] = useState<Vehicle['drivingStyle']>('normal');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [purchaseOdo, setPurchaseOdo] = useState<number>();
  const [answers, setAnswers] = useState<Record<string, Answer>>(
    Object.fromEntries(CORE_ITEM_KEYS.map((k) => [k, { mode: 'unsure' as Mode, date: today, odometer: undefined }])),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);

  const restoreFromFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return setError('That file is not valid JSON.');
    }
    const parsed = parseExport(raw);
    if (!parsed.ok) return setError(parsed.error);
    await repo.replaceAll(exportToDump(parsed.file));
  };

  const setAnswer = (key: string, patch: Partial<Answer>) => setAnswers({ ...answers, [key]: { ...answers[key]!, ...patch } });
  const anyNever = Object.values(answers).some((a) => a.mode === 'never');

  const next = () => {
    setError('');
    if (STEPS[step] === 'odometer' && odometer === undefined) return setError('Enter your current odometer reading.');
    setStep(step + 1);
  };

  const validateServices = () => {
    for (const [key, a] of Object.entries(answers)) {
      if (a.mode !== 'entered') continue;
      if (a.odometer === undefined) return setError(`Enter the mileage for ${NAMES[key]}, or choose “Not sure”.`);
      if (a.odometer > (odometer ?? 0)) return setError(`${NAMES[key]}: mileage is higher than the current odometer.`);
    }
    setError('');
    setStep(step + 1);
  };

  const finish = async () => {
    const services: Record<string, ServiceAnswer> = {};
    for (const [key, a] of Object.entries(answers)) {
      services[key] = a.mode === 'entered' ? { mode: 'entered', date: a.date, odometer: a.odometer ?? 0 } : ({ mode: a.mode } as ServiceAnswer);
    }
    setSaving(true);
    await runOnboarding(
      repo,
      {
        vehicle: { nickname: nickname.trim() || 'CX-5', year, units, drivingStyle: style, vin: vin.trim() || undefined, plate: plate.trim() || undefined },
        odometer: odometer ?? 0,
        services,
        purchaseDate: anyNever ? purchaseDate : undefined,
        purchaseOdometer: anyNever ? purchaseOdo : undefined,
      },
      today,
    );
    if (syncConfig) {
      try {
        await getSync().connect(syncConfig);
      } catch {
        // The car is saved either way; sync can be connected again from Settings.
      }
    }
  };

  const name = STEPS[step];
  return (
    <main class="onboarding">
      <div class="onboarding-body">
        {name === 'welcome' && (
          <>
            <h1>Torque</h1>
            <p>Know what your CX-5 needs next, and when. Everything stays on this phone.</p>
            <InstallHint />
            <button type="button" class="btn btn-primary btn-block" onClick={next}>Get started</button>
            <button type="button" class="btn-text" onClick={() => restoreInput.current?.click()}>Restore from backup file</button>
            <input ref={restoreInput} type="file" accept="application/json,.json" class="visually-hidden" aria-label="Choose backup file"
              onChange={(e) => { const i = e.currentTarget as HTMLInputElement; void restoreFromFile(i.files?.[0]); i.value = ''; }} />
            <button type="button" class="btn-text" onClick={() => setRestoring(!restoring)}>Restore from GitHub</button>
            {restoring && (
              <section class="card">
                <p class="muted">Enter the repository and token you used before. Your records, readings and photos come back.</p>
                <SyncForm mode="restore" />
              </section>
            )}
          </>
        )}

        {name === 'vehicle' && (
          <>
            <h1>Your car</h1>
            <Field label="Model year">
              <select class="input" value={year} onChange={(e) => setYear(Number((e.currentTarget as HTMLSelectElement).value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <TextInput label="Nickname" value={nickname} onChange={setNickname} />
            <p class="muted">Trim: Signature 2.5 Turbo</p>
            <TextInput label="VIN (optional)" value={vin} onChange={setVin} />
            <TextInput label="Plate (optional)" value={plate} onChange={setPlate} />
            <Segmented label="Units" value={units} options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometres' }]} onChange={setUnits} />
          </>
        )}

        {name === 'odometer' && (
          <>
            <h1>Current odometer</h1>
            <NumberInput label={`Reading (${units})`} value={odometer} large autoFocus onChange={setOdometer} />
          </>
        )}

        {name === 'style' && (
          <>
            <h1>Driving style</h1>
            <Segmented label="Style" value={style} options={[{ value: 'normal', label: 'Normal' }, { value: 'severe', label: 'Severe' }]} onChange={setStyle} />
            <p class="muted">Choose Severe for towing, mostly short trips, extreme heat or cold, or dusty roads. It shortens some intervals. You can change it later.</p>
          </>
        )}

        {name === 'services' && (
          <>
            <h1>Last services</h1>
            <p class="muted">When was each last done? “Not sure” counts as due now.</p>
            {CORE_ITEM_KEYS.map((key) => {
              const a = answers[key]!;
              return (
                <section key={key} class="card">
                  <strong>{NAMES[key]}</strong>
                  <Segmented
                    label={`${NAMES[key]} history`}
                    hideLabel
                    value={a.mode}
                    options={[{ value: 'entered', label: 'Enter' }, { value: 'unsure', label: 'Not sure' }, { value: 'never', label: 'Never, new' }]}
                    onChange={(mode) => setAnswer(key, { mode })}
                  />
                  {a.mode === 'entered' && (
                    <>
                      <DateInput label="Date" value={a.date} onChange={(date) => setAnswer(key, { date })} />
                      <NumberInput label={`Mileage (${units})`} value={a.odometer} onChange={(v) => setAnswer(key, { odometer: v })} />
                    </>
                  )}
                </section>
              );
            })}
            {anyNever && (
              <section class="card">
                <strong>Purchase details</strong>
                <p class="muted">For items marked “Never, new”, the clock starts here.</p>
                <DateInput label="Purchase date" value={purchaseDate} onChange={setPurchaseDate} />
                <NumberInput label={`Odometer at purchase (${units})`} value={purchaseOdo ?? odometer} onChange={setPurchaseOdo} />
              </section>
            )}
          </>
        )}

        {name === 'sync' && (
          <>
            <h1>Cloud sync</h1>
            <p class="muted">
              Optional. Keeps your data in a private GitHub repository you own, so losing the phone loses nothing. You can also set this up later in Settings.
            </p>
            <SyncForm mode="onboarding" onReady={setSyncConfig} />
          </>
        )}

        {error && <p class="error" role="alert">{error}</p>}
      </div>

      {name !== 'welcome' && (
        <footer class="onboarding-footer">
          <button type="button" class="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>
          {name === 'sync' ? (
            <button type="button" class="btn btn-primary" disabled={saving} onClick={() => void finish()}>{syncConfig ? 'Finish' : 'Skip and finish'}</button>
          ) : name === 'services' ? (
            <button type="button" class="btn btn-primary" onClick={validateServices}>Next</button>
          ) : (
            <button type="button" class="btn btn-primary" onClick={next}>Next</button>
          )}
        </footer>
      )}
    </main>
  );
}
