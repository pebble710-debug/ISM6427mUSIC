import { useState } from 'react';
import { MusicNoteIcon } from './Icons.tsx';

export function Artwork({ src, alt, size = 56, className = '' }: { src?: string; alt: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`artwork ${className}`} style={{ width: size, height: size }}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <MusicNoteIcon width={size * 0.4} height={size * 0.4} />
      )}
    </div>
  );
}
