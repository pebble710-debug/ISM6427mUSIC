import type { ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  hint?: string;
  /** Accessible name when the visible label may be hidden (e.g. icon-only on mobile). */
  ariaLabel?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label, className = '' }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; className?: string }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label} style={{ ['--count' as string]: options.length, ['--index' as string]: index }}>
      <span className="segmented-thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel}
          title={o.hint}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
