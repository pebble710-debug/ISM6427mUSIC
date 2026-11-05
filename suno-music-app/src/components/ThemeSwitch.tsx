import type { ThemePref } from '../lib/prefs.ts';
import { AutoIcon, MoonIcon, SunIcon } from './Icons.tsx';
import { Segmented } from './Segmented.tsx';

export function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (v: ThemePref) => void }) {
  return (
    <div className="theme-switch-wrap" data-testid="theme-switch">
      <Segmented
        label="Appearance"
        value={value}
        onChange={onChange}
        className="theme-switch"
        options={[
          { value: 'light', label: <><SunIcon width={15} height={15} /><span className="theme-label">Light</span></>, hint: 'Light appearance', ariaLabel: 'Light' },
          { value: 'dark', label: <><MoonIcon width={15} height={15} /><span className="theme-label">Dark</span></>, hint: 'Dark appearance', ariaLabel: 'Dark' },
          { value: 'auto', label: <><AutoIcon width={15} height={15} /><span className="theme-label">Auto</span></>, hint: 'Match system appearance', ariaLabel: 'Auto' },
        ]}
      />
    </div>
  );
}
