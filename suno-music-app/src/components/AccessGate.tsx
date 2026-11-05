import { useState, type FormEvent } from 'react';
import { ApiError, api, setAccessCode } from '../lib/api.ts';
import { LockIcon } from './Icons.tsx';

export function AccessGate({ onUnlocked }: { onUnlocked: (credits: number | null) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError('Enter the access code.');
    setBusy(true);
    setError(null);
    try {
      const { credits } = await api.credits(code.trim());
      setAccessCode(code.trim());
      onUnlocked(credits);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('That access code is not valid.');
      else if (err instanceof ApiError && err.code !== 'access_denied' && err.status !== 401) {
        // The code was accepted but SunoAPI failed (e.g. key not configured) — still unlock.
        setAccessCode(code.trim());
        onUnlocked(null);
      } else setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <form className="panel gate-card" onSubmit={submit}>
        <div className="gate-icon"><LockIcon width={28} height={28} /></div>
        <h2 id="gate-title">Enter access code</h2>
        <p className="muted">This studio is private. Enter the access code provided by the site owner.</p>
        <input type="password" autoComplete="current-password" aria-label="Access code" placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        {error && <div className="alert" role="alert">{error}</div>}
        <button className="cta" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Unlock studio'}</button>
      </form>
    </div>
  );
}
