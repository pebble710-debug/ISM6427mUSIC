import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LIMITS, type GenerateRequest, type GenerationMode, type SunoModel } from '../../shared/types.ts';
import { ApiError, api } from '../lib/api.ts';
import { hasPref, loadPrefs, savePrefs } from '../lib/prefs.ts';
import { surpriseIdea } from '../lib/surprise.ts';
import { DiceIcon, LyricsIcon, MicIcon, SparkleIcon, WaveIcon } from './Icons.tsx';
import { Segmented } from './Segmented.tsx';

export const GENRES = [
  'Pop', 'Hip-Hop', 'R&B', 'Rock', 'Electronic', 'Lo-fi', 'Jazz', 'Classical', 'Cinematic',
  'Synthwave', 'Ambient', 'Country', 'Folk', 'Reggaeton', 'K-Pop', 'Metal', 'Funk', 'House',
];

const MODEL_INFO: Record<SunoModel, string> = {
  V6: 'V6 — natural vocals, richest detail (recommended)',
  V6_WILD: 'V6 Wild — bolder, more experimental',
  V6_MINI: 'V6 Mini — fastest, lightweight',
};

const DRAFT_KEY = 'ams.draft.v1';

interface Draft {
  mode: GenerationMode;
  prompt: string;
  genres: string[];
  styleExtra: string;
  instrumental: boolean;
  title: string;
  lyrics: string;
  negativeTags: string;
  vocalGender: 'any' | 'm' | 'f';
  duration: number;
  model: SunoModel;
}

const EMPTY: Draft = {
  mode: 'simple', prompt: '', genres: [], styleExtra: '', instrumental: false, title: '', lyrics: '',
  negativeTags: '', vocalGender: 'any', duration: 120, model: 'V6',
};

function loadDraft(): Draft {
  let draft = EMPTY;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) draft = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // Saved preferences (genre, vocal/instrumental) take priority over the last draft.
  const prefs = loadPrefs();
  if (hasPref('genres')) draft = { ...draft, genres: prefs.genres.filter((g) => GENRES.includes(g)) };
  if (hasPref('instrumental')) draft = { ...draft, instrumental: prefs.instrumental };
  return draft;
}

/** Builds the request for our /api/generate endpoint (the server re-validates everything). */
export function buildRequest(d: Draft): GenerateRequest {
  const style = [...d.genres, d.styleExtra.trim()].filter(Boolean).join(', ');
  if (d.mode === 'simple') {
    return { mode: 'simple', model: d.model, instrumental: d.instrumental, prompt: d.prompt.trim(), style };
  }
  const req: GenerateRequest = { mode: 'custom', model: d.model, instrumental: d.instrumental, style, duration: d.duration };
  if (d.title.trim()) req.title = d.title.trim();
  if (!d.instrumental && d.lyrics.trim()) req.lyrics = d.lyrics.trim();
  if (d.negativeTags.trim()) req.negativeTags = d.negativeTags.trim();
  if (!d.instrumental && d.vocalGender !== 'any') req.vocalGender = d.vocalGender;
  if (!req.style) delete req.style;
  return req;
}

export function validateDraft(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const req = buildRequest(d);
  if (d.mode === 'simple') {
    if (!req.prompt) e.prompt = 'Describe the song you want to create.';
    else if (req.prompt.length > LIMITS.simplePrompt) e.prompt = `Keep the description under ${LIMITS.simplePrompt} characters.`;
    if (!req.style) e.style = 'Pick at least one genre or type a style.';
  } else {
    if (!req.style && !req.lyrics && !req.negativeTags) e.style = 'Pick a genre or describe the sound.';
    if (!d.instrumental && !req.lyrics) e.lyrics = 'Add lyrics, or switch to Instrumental.';
    if ((req.title?.length ?? 0) > LIMITS.title) e.title = `Title must be ${LIMITS.title} characters or fewer.`;
    if ((req.lyrics?.length ?? 0) > LIMITS.lyrics) e.lyrics = `Lyrics must be ${LIMITS.lyrics} characters or fewer.`;
    if ((req.negativeTags?.length ?? 0) > LIMITS.negativeTags) e.negativeTags = 'Too long.';
  }
  if ((req.style?.length ?? 0) > LIMITS.style) e.style = `Style must be ${LIMITS.style} characters or fewer.`;
  return e;
}

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`counter ${value > max ? 'over' : ''}`}>{value}/{max}</span>;
}

export function Composer({ onCreated, disabled }: { onCreated: (taskId: string, req: GenerateRequest) => void; disabled?: boolean }) {
  const [d, setD] = useState<Draft>(loadDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const [spin, setSpin] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    if (k === 'genres') savePrefs({ genres: v as string[] });
    if (k === 'instrumental') savePrefs({ instrumental: v as boolean });
    setD((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      const { [k as string]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);

  const styleLength = useMemo(() => buildRequest(d).style?.length ?? 0, [d]);

  const toggleGenre = (g: string) =>
    set('genres', d.genres.includes(g) ? d.genres.filter((x) => x !== g) : [...d.genres, g].slice(0, 6));

  const insertSection = (tag: string) => {
    const el = lyricsRef.current;
    const insert = `${d.lyrics && !d.lyrics.endsWith('\n') ? '\n\n' : ''}[${tag}]\n`;
    const pos = el ? el.selectionEnd : d.lyrics.length;
    const next = d.lyrics.slice(0, pos) + insert + d.lyrics.slice(pos);
    set('lyrics', next);
    requestAnimationFrame(() => {
      el?.focus();
      const p = pos + insert.length;
      el?.setSelectionRange(p, p);
    });
  };

  /** Local only — fills in a random idea. Never calls the API. */
  const surprise = () => {
    const idea = surpriseIdea(Math.random, d.mode === 'simple' ? d.prompt : d.styleExtra);
    setD((prev) => ({
      ...prev,
      ...(prev.mode === 'simple' ? { prompt: idea.prompt } : { styleExtra: idea.sound }),
      // Respect the user's chosen genres; suggest one only if none is selected.
      genres: prev.genres.length ? prev.genres : [idea.genre],
    }));
    setErrors({});
    setSpin(true);
    setTimeout(() => setSpin(false), 500);
  };

  const surpriseButton = (
    <button type="button" className={`surprise ${spin ? 'spin' : ''}`} onClick={surprise} title="Fill in a random song idea (free — no credits used)">
      <DiceIcon width={15} height={15} /> Surprise Me
    </button>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const v = validateDraft(d);
    setErrors(v);
    if (Object.keys(v).length) return;
    const req = buildRequest(d);
    setSubmitting(true);
    try {
      const { taskId } = await api.generate(req);
      onCreated(taskId, req);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setSubmitError(err.message);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const custom = d.mode === 'custom';

  return (
    <form className="panel composer" onSubmit={submit} noValidate aria-labelledby="composer-title">
      <div className="panel-head">
        <div>
          <h2 id="composer-title">Create</h2>
          <p className="muted">Describe it, pick a sound, and let the studio compose.</p>
        </div>
        <Segmented
          label="Creation mode"
          value={d.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'simple', label: 'Simple', hint: 'Describe the song — lyrics are written for you' },
            { value: 'custom', label: 'Custom', hint: 'Write your own lyrics, title and style' },
          ]}
        />
      </div>

      {!custom && (
        <div className="field">
          <div className="label-row">
            <label htmlFor="prompt">Describe your song</label>
            {surpriseButton}
          </div>
          <textarea
            id="prompt"
            rows={4}
            placeholder="A dreamy late-night drive song about city lights and second chances, with warm synths and soft female vocals"
            value={d.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            aria-invalid={Boolean(errors.prompt)}
            aria-describedby="prompt-help"
          />
          <div className="field-foot" id="prompt-help">
            {errors.prompt ? <span className="error-text">{errors.prompt}</span> : <span className="muted">Lyrics are generated automatically from your description.</span>}
            <Counter value={d.prompt.length} max={LIMITS.simplePrompt} />
          </div>
        </div>
      )}

      {custom && (
        <div className="field">
          <label htmlFor="title">Song title <span className="optional">optional</span></label>
          <input id="title" type="text" maxLength={LIMITS.title + 20} placeholder="Neon Afterglow" value={d.title} onChange={(e) => set('title', e.target.value)} aria-invalid={Boolean(errors.title)} />
          <div className="field-foot">
            {errors.title ? <span className="error-text">{errors.title}</span> : <span />}
            <Counter value={d.title.length} max={LIMITS.title} />
          </div>
        </div>
      )}

      <div className="field">
        <div className="label-row">
          <span className="label" id="genre-label">Genre &amp; style</span>
          {custom && surpriseButton}
        </div>
        <div className="chips" role="group" aria-labelledby="genre-label">
          {GENRES.map((g) => (
            <button type="button" key={g} className={`chip ${d.genres.includes(g) ? 'on' : ''}`} aria-pressed={d.genres.includes(g)} onClick={() => toggleGenre(g)}>
              {g}
            </button>
          ))}
        </div>
        <input
          type="text"
          aria-label={custom ? 'Describe the sound' : 'Additional style tags'}
          placeholder={custom ? 'Describe the sound: dreamy, 90 bpm, analog synths, airy female vocals' : 'More style tags (optional): dreamy, 90 bpm, analog synths'}
          value={d.styleExtra}
          onChange={(e) => set('styleExtra', e.target.value)}
          aria-invalid={Boolean(errors.style)}
        />
        <div className="field-foot">
          {errors.style ? <span className="error-text">{errors.style}</span> : <span className="muted">{d.genres.length ? `Selected: ${d.genres.join(', ')}` : 'Choose up to 6 genres.'}</span>}
          <Counter value={styleLength} max={LIMITS.style} />
        </div>
      </div>

      <div className="field">
        <span className="label">Type</span>
        <Segmented
          label="Vocal or instrumental"
          value={d.instrumental ? 'inst' : 'vocal'}
          onChange={(v) => set('instrumental', v === 'inst')}
          options={[
            { value: 'vocal', label: <><MicIcon width={16} height={16} /> Vocal</> },
            { value: 'inst', label: <><WaveIcon width={16} height={16} /> Instrumental</> },
          ]}
        />
      </div>

      {custom && !d.instrumental && (
        <div className="field">
          <div className="label-row">
            <label htmlFor="lyrics"><LyricsIcon width={16} height={16} /> Lyrics</label>
            <div className="section-tags" aria-label="Insert song section">
              {['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'].map((t) => (
                <button type="button" key={t} className="mini" onClick={() => insertSection(t)}>[{t}]</button>
              ))}
            </div>
          </div>
          <textarea
            id="lyrics"
            ref={lyricsRef}
            rows={9}
            className="mono"
            placeholder={'[Verse]\nCity lights are humming low…\n\n[Chorus]\nWe are the afterglow…'}
            value={d.lyrics}
            onChange={(e) => set('lyrics', e.target.value)}
            aria-invalid={Boolean(errors.lyrics)}
          />
          <div className="field-foot">
            {errors.lyrics ? <span className="error-text">{errors.lyrics}</span> : <span className="muted">Your lyrics are sung exactly as written.</span>}
            <Counter value={d.lyrics.length} max={LIMITS.lyrics} />
          </div>
        </div>
      )}

      <button type="button" className="disclosure" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((s) => !s)}>
        <span className={`chev ${showAdvanced ? 'open' : ''}`} aria-hidden>›</span> Advanced settings
      </button>

      {showAdvanced && (
        <div className="advanced">
          <div className="field">
            <label htmlFor="model">Model</label>
            <select id="model" value={d.model} onChange={(e) => set('model', e.target.value as SunoModel)}>
              {(Object.keys(MODEL_INFO) as SunoModel[]).map((m) => (
                <option key={m} value={m}>{MODEL_INFO[m]}</option>
              ))}
            </select>
          </div>
          {custom ? (
            <>
              {!d.instrumental && (
                <div className="field">
                  <span className="label">Voice</span>
                  <Segmented
                    label="Vocal gender"
                    value={d.vocalGender}
                    onChange={(v) => set('vocalGender', v)}
                    options={[{ value: 'any', label: 'Any' }, { value: 'f', label: 'Female' }, { value: 'm', label: 'Male' }]}
                  />
                  <span className="muted small">A preference — the model may not always follow it.</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="duration">Length: <strong>{Math.floor(d.duration / 60)}:{String(d.duration % 60).padStart(2, '0')}</strong></label>
                <input id="duration" type="range" min={LIMITS.durationMin} max={LIMITS.durationMax} step={10} value={d.duration} onChange={(e) => set('duration', Number(e.target.value))} style={{ ['--pct' as string]: `${((d.duration - LIMITS.durationMin) / (LIMITS.durationMax - LIMITS.durationMin)) * 100}%` }} />
              </div>
              <div className="field">
                <label htmlFor="neg">Exclude styles <span className="optional">optional</span></label>
                <input id="neg" type="text" placeholder="Heavy metal, harsh drums" value={d.negativeTags} onChange={(e) => set('negativeTags', e.target.value)} aria-invalid={Boolean(errors.negativeTags)} />
              </div>
            </>
          ) : (
            <p className="muted small">Switch to Custom mode for lyrics, title, voice, length and excluded styles.</p>
          )}
        </div>
      )}

      {submitError && <div className="alert" role="alert">{submitError}</div>}

      <button className="cta" type="submit" disabled={submitting || disabled}>
        {submitting ? <span className="spinner" aria-hidden /> : <SparkleIcon />}
        {submitting ? 'Starting generation…' : 'Generate song'}
      </button>
      <p className="muted small center">Each request usually creates two variations. Generation usually takes 1–3 minutes.</p>
    </form>
  );
}
