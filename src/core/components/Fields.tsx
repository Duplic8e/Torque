import type { ComponentChildren } from 'preact';

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  list?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  placeholder?: string;
}) {
  return (
    <Field label={props.label}>
      <input
        class="input"
        type="text"
        value={props.value}
        list={props.list}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)}
      />
    </Field>
  );
}

export function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input class="input" type="date" value={value} onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)} />
    </Field>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  hideLabel?: boolean;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="field" role="radiogroup" aria-label={label}>
      <span class={hideLabel ? 'visually-hidden' : 'field-label'}>{label}</span>
      <div class="segmented">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle-row">
      <span>{label}</span>
      <input type="checkbox" class="toggle" checked={checked} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
    </label>
  );
}
