import { fmtNum } from '../format';

interface Props {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  large?: boolean;
  autoFocus?: boolean;
  suffix?: string;
}

/** Numeric keypad input that shows thousands separators as you type. */
export function NumberInput({ label, value, onChange, large = false, autoFocus = false, suffix }: Props) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <span class="input-wrap">
        <input
          class={large ? 'input input-large num' : 'input num'}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value === undefined ? '' : fmtNum(value)}
          onInput={(e) => {
            const digits = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '');
            onChange(digits === '' ? undefined : Number(digits));
          }}
        />
        {suffix && <span class="input-suffix muted">{suffix}</span>}
      </span>
    </label>
  );
}
