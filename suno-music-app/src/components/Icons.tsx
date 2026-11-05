import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, ...p });

export const PlayIcon = (p: P) => (
  <svg {...base(p)}><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" fill="currentColor" /></svg>
);
export const PauseIcon = (p: P) => (
  <svg {...base(p)}><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" /></svg>
);
export const NextIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 6.2v11.6a.8.8 0 0 0 1.25.66L13 13v4.8a.8.8 0 0 0 1.25.66l8.2-5.8a.8.8 0 0 0 0-1.32l-8.2-5.8A.8.8 0 0 0 13 6.2V11L5.25 5.54A.8.8 0 0 0 4 6.2Z" fill="currentColor" /></svg>
);
export const PrevIcon = (p: P) => (
  <svg {...base(p)} style={{ transform: 'scaleX(-1)' }}><path d="M4 6.2v11.6a.8.8 0 0 0 1.25.66L13 13v4.8a.8.8 0 0 0 1.25.66l8.2-5.8a.8.8 0 0 0 0-1.32l-8.2-5.8A.8.8 0 0 0 13 6.2V11L5.25 5.54A.8.8 0 0 0 4 6.2Z" fill="currentColor" /></svg>
);
export const DownloadIcon = (p: P) => (
  <svg {...base(p)}><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const SparkleIcon = (p: P) => (
  <svg {...base(p)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm6.5 11 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" fill="currentColor" /></svg>
);
export const MicIcon = (p: P) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
export const WaveIcon = (p: P) => (
  <svg {...base(p)}><path d="M3 12h2m3-5v10m4-13v16m4-11v6m4-3h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}><path d="M5 7h14M10 11v6m4-6v6M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
export const RefreshIcon = (p: P) => (
  <svg {...base(p)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const VolumeIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
export const MusicNoteIcon = (p: P) => (
  <svg {...base(p)}><path d="M9 18V6l11-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="6.5" cy="18" r="2.5" fill="currentColor" /><circle cx="17.5" cy="16" r="2.5" fill="currentColor" /></svg>
);
export const LyricsIcon = (p: P) => (
  <svg {...base(p)}><path d="M5 6h14M5 10h14M5 14h9M5 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
export const LockIcon = (p: P) => (
  <svg {...base(p)}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" /></svg>
);
export const SunIcon = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
);
export const MoonIcon = (p: P) => (
  <svg {...base(p)}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>
);
export const AutoIcon = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" /></svg>
);
export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)}><path d="M12 20.3s-7.5-4.5-7.5-10.3A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.8-7.5 10.3-7.5 10.3Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>
);
export const ShuffleIcon = (p: P) => (
  <svg {...base(p)}><path d="M3 7h3.5c2.2 0 3.4 1.2 4.5 3l2 3.5c1 1.8 2.3 3.5 4.5 3.5H21M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14 8.4c.8-.9 1.8-1.4 3.2-1.4H21M18 4l3 3-3 3M18 14l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const RepeatIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19m0 0-3-3m3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5m0 0 3 3m-3-3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const DiceIcon = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="9" r="1.4" fill="currentColor" /><circle cx="15" cy="15" r="1.4" fill="currentColor" /><circle cx="15" cy="9" r="1.4" fill="currentColor" /><circle cx="9" cy="15" r="1.4" fill="currentColor" /></svg>
);
