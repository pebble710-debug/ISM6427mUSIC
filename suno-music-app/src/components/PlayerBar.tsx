import type { Track } from '../../shared/types.ts';
import { formatTime } from '../lib/format.ts';
import type { Player } from '../hooks/usePlayer.ts';
import { Artwork } from './Artwork.tsx';
import { DownloadIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon } from './Icons.tsx';

export function PlayerBar({ player, onDownload, downloading }: { player: Player; onDownload: (taskId: string, t: Track) => void; downloading: boolean }) {
  const { current } = player;
  const dur = player.duration || current?.track.duration || 0;
  const pct = dur ? Math.min(100, (player.time / dur) * 100) : 0;

  return (
    <div className={`player ${current ? 'visible' : ''}`} role="region" aria-label="Now playing" aria-hidden={!current}>
      {current && (
        <>
          <div className="player-track">
            <Artwork src={current.track.imageUrl} alt="" size={52} className={player.playing ? 'spin-glow' : ''} />
            <div className="player-meta">
              <div className="player-title" data-testid="now-playing-title">{current.track.title}</div>
              <div className="player-sub">{player.error ? <span className="error-text">{player.error}</span> : current.track.tags || 'AI Music Studio'}</div>
            </div>
          </div>

          <div className="player-center">
            <div className="player-controls">
              <button type="button" className="icon-btn" onClick={player.prev} aria-label="Previous track"><PrevIcon /></button>
              <button type="button" className="play-btn" onClick={player.toggle} aria-label={player.playing ? 'Pause' : 'Play'} data-testid="player-toggle">
                {player.loading && !player.playing ? <span className="spinner" aria-hidden /> : player.playing ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
              </button>
              <button type="button" className="icon-btn" onClick={player.next} aria-label="Next track"><NextIcon /></button>
            </div>
            <div className="scrubber">
              <span className="time" data-testid="player-time">{formatTime(player.time)}</span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.1}
                value={Math.min(player.time, dur || 0)}
                onChange={(e) => player.seek(Number(e.target.value))}
                aria-label="Seek"
                style={{ ['--pct' as string]: `${pct}%` }}
                disabled={!dur}
              />
              <span className="time">{formatTime(dur)}</span>
            </div>
          </div>

          <div className="player-right">
            <VolumeIcon width={18} height={18} className="muted-icon" />
            <input
              type="range"
              className="volume"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={(e) => player.setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{ ['--pct' as string]: `${player.volume * 100}%` }}
            />
            <button
              type="button"
              className="icon-btn"
              disabled={!current.track.audioUrl || downloading}
              onClick={() => onDownload(current.taskId, current.track)}
              aria-label="Download current track"
            >
              {downloading ? <span className="spinner small" aria-hidden /> : <DownloadIcon />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
