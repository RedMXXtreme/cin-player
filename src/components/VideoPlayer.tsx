"use client";

import "./VideoPlayer.css";
import { useVideoSources } from "@/hooks/useVideoSources";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ServerName } from "@/lib/mapper";
import Hls from "hls.js";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Volume1,
  VolumeX,
  Subtitles,
  Maximize,
  Minimize,
} from "lucide-react";

const ICON_LG = 22;
const ICON_SM = 20;

interface Props {
  type: "tv" | "movie";
  id: string;
  season?: number;
  episode?: number;
}

function formatTime(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function VideoPlayer({ type, id, season, episode }: Props) {
  const { data, loading, error } = useVideoSources(
    type === "tv"
      ? { type, id, season: season!, episode: episode! }
      : { type, id }
  );

  const [activeServer, setActiveServer] = useState<ServerName>("megacloud");

  // Refs
  const videoRef      = useRef<HTMLVideoElement>(null);
  const hlsRef        = useRef<Hls | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const seekBarRef    = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef        = useRef<number | null>(null);
  const isDragging    = useRef(false);

  // Stable value mirrors (for callbacks that must not re-register)
  const volumeRef   = useRef(1);
  const playingRef  = useRef(false);
  const durationRef = useRef(0);

  // ── State ──────────────────────────────────────────────────────────────────
  const [playing,        setPlaying]        = useState(false);
  const [currentTime,    setCurrentTime]    = useState(0);
  const [duration,       setDuration]       = useState(0);
  const [buffered,       setBuffered]       = useState(0);
  const [volume,         setVolume]         = useState(1);
  const [muted,          setMuted]          = useState(false);
  const [fullscreen,     setFullscreen]     = useState(false);
  const [showControls,   setShowControls]   = useState(true);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [qualities,      setQualities]      = useState<{ height: number; index: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showQualityMenu,setShowQualityMenu]= useState(false);
  const [showSubMenu,    setShowSubMenu]    = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [currentSub,     setCurrentSub]     = useState<string | null>(null);
  const [skipFeedback,   setSkipFeedback]   = useState<{ dir: "fwd" | "bwd"; key: number } | null>(null);
  const [isBuffering,    setIsBuffering]    = useState(false);
  const [hoverTime,      setHoverTime]      = useState<{ x: number; time: number } | null>(null);
  const [volVisible,     setVolVisible]     = useState(false);

  // Keep mirrors in sync
  volumeRef.current   = volume;
  playingRef.current  = playing;
  durationRef.current = duration;

  const current   = data?.sources.find((s) => s.server === activeServer) ?? data?.sources[0];
  const subtitles = current?.subtitles ?? [];

  // ── RAF timeline loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const t   = v.currentTime;
        const d   = isFinite(v.duration) ? v.duration : 0;
        const buf = v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) : 0;
        setCurrentTime((p) => (Math.abs(p - t)   > 0.25 ? t   : p));
        setDuration   ((p) => (p !== d            ? d   : p));
        setBuffered   ((p) => (Math.abs(p - buf)  > 0.5  ? buf : p));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── HLS source loading ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!current?.proxiedUrl || !videoRef.current) return;
    setPlaying(false); setCurrentTime(0); setDuration(0);
    setBuffered(0); setQualities([]); setCurrentQuality(-1); setIsBuffering(true);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const video = videoRef.current;
    if (current.isM3U8 && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(current.proxiedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
        setQualities(d.levels.map((l, i) => ({ height: l.height, index: i })));
        setCurrentQuality(-1);
        setIsBuffering(false);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setCurrentQuality(d.level));
    } else {
      video.src = current.proxiedUrl;
      setIsBuffering(false);
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [current?.proxiedUrl]);

  // ── Video events (binary state only — RAF handles timeline) ───────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay    = () => setPlaying(true);
    const onPause   = () => setPlaying(false);
    const onEnded   = () => setPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onResume  = () => setIsBuffering(false);
    const onVol     = () => { setVolume(v.volume); setMuted(v.muted); };
    v.addEventListener("play",        onPlay);
    v.addEventListener("pause",       onPause);
    v.addEventListener("ended",       onEnded);
    v.addEventListener("waiting",     onWaiting);
    v.addEventListener("canplay",     onResume);
    v.addEventListener("playing",     onResume);
    v.addEventListener("volumechange",onVol);
    return () => {
      v.removeEventListener("play",        onPlay);
      v.removeEventListener("pause",       onPause);
      v.removeEventListener("ended",       onEnded);
      v.removeEventListener("waiting",     onWaiting);
      v.removeEventListener("canplay",     onResume);
      v.removeEventListener("playing",     onResume);
      v.removeEventListener("volumechange",onVol);
    };
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  // ── Stable callbacks ───────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const skip = useCallback((secs: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(durationRef.current || Infinity, v.currentTime + secs));
    setSkipFeedback({ dir: secs > 0 ? "fwd" : "bwd", key: Date.now() });
    if (skipTimer.current) clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => setSkipFeedback(null), 800);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    v.muted  = val <= 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted) { v.muted = false; if (v.volume === 0) v.volume = 0.5; }
    else v.muted = true;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current.requestFullscreen();
  }, []);

  // ── Seek ───────────────────────────────────────────────────────────────────
  const getRatio = useCallback((clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) return 0;
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const seekTo = useCallback((ratio: number) => {
    const v = videoRef.current;
    if (!v || !durationRef.current) return;
    v.currentTime = ratio * durationRef.current;
  }, []);

  const onSeekDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    seekTo(getRatio(e.clientX));
    const move = (ev: MouseEvent) => { if (isDragging.current) seekTo(getRatio(ev.clientX)); };
    const up   = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup",   up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup",   up);
  }, [getRatio, seekTo]);

  const onSeekMove = useCallback((e: React.MouseEvent) => {
    const bar = seekBarRef.current;
    if (!bar || !durationRef.current) return;
    const r     = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHoverTime({ x: e.clientX - r.left, time: ratio * durationRef.current });
  }, []);

  // ── Controls hide timer ────────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (playingRef.current) setShowControls(false);
    }, 3500);
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      switch (e.code) {
        case "Space": case "KeyK": e.preventDefault(); togglePlay(); resetTimer(); break;
        case "ArrowRight":         e.preventDefault(); skip(10);     resetTimer(); break;
        case "ArrowLeft":          e.preventDefault(); skip(-10);    resetTimer(); break;
        case "ArrowUp":            e.preventDefault(); changeVolume(volumeRef.current + 0.1); break;
        case "ArrowDown":          e.preventDefault(); changeVolume(volumeRef.current - 0.1); break;
        case "KeyM":               e.preventDefault(); toggleMute();       break;
        case "KeyF":               e.preventDefault(); toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skip, changeVolume, toggleMute, toggleFullscreen, resetTimer]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const closeMenus = () => { setShowQualityMenu(false); setShowSubMenu(false); setShowServerMenu(false); };

  const setQuality = (idx: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = idx;
    setCurrentQuality(idx);
    setShowQualityMenu(false);
  };

  const progress    = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered   / duration) * 100) : 0;

  if (loading) return <PlayerSkeleton />;
  if (error)   return <ErrorState message={error} />;
  if (!data?.sources.length) return <ErrorState message="No sources available" />;

  const activeQLabel = currentQuality === -1
    ? "Auto"
    : `${qualities.find((q) => q.index === currentQuality)?.height ?? "?"}p`;

  return (
    /* ── Outer wrapper keeps 16:9 ratio without expanding page height ── */
    <div className="nvp-wrap">
      <div
        ref={containerRef}
        className={`nvp${showControls ? " nvp--show" : ""}${fullscreen ? " nvp--fs" : ""}`}
        onMouseMove={resetTimer}
        onMouseLeave={() => { if (playingRef.current) setShowControls(false); }}
        onTouchStart={resetTimer}
      >
        {/* ── VIDEO ── */}
        <video ref={videoRef} className="nvp__video" playsInline crossOrigin="anonymous">
          {subtitles.map((sub) => (
            <track key={sub.label} kind={sub.kind as any} src={sub.file} label={sub.label} default={currentSub === sub.file} />
          ))}
        </video>

        {/* ── VIGNETTE ── */}
        <div className="nvp__vignette" />

        {/* ── BUFFERING RING ── */}
        {isBuffering && (
          <div className="nvp__spinner"><div className="nvp__ring" /></div>
        )}

        {/* ── SKIP FEEDBACK ── */}
        {skipFeedback && (
          <div key={skipFeedback.key} className={`nvp__skip nvp__skip--${skipFeedback.dir}`}>
            <div className="nvp__skip-ripple" />
            <div className="nvp__skip-icons">
              {[0, 1, 2].map((i) => (
                <svg key={i} viewBox="0 0 24 24" fill="white" width="22" height="22"
                  className="nvp__skip-chevron" style={{ animationDelay: `${i * 80}ms` }}>
                  {skipFeedback.dir === "fwd"
                    ? <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41z"/>
                    : <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z"/>}
                </svg>
              ))}
            </div>
            <span className="nvp__skip-label">10 seconds</span>
          </div>
        )}

        {/* ══════════ TOP BAR ══════════ */}
        <div className="nvp__top">
          <button className="nvp__back" onClick={(e) => { e.stopPropagation(); window.history.back(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="22" height="22">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="nvp__meta">
            <span className="nvp__show-title">{data.title}</span>
            {data.episodeName && <span className="nvp__ep">{data.episodeName}</span>}
          </div>
          <div className="nvp__server-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              className={`nvp__server-btn${showServerMenu ? " open" : ""}`}
              onClick={() => { setShowServerMenu((p) => !p); setShowQualityMenu(false); setShowSubMenu(false); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
              </svg>
              {activeServer === "megacloud" ? "MegaCloud" : "UpCloud"}
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style={{ opacity: 0.6 }}>
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
            {showServerMenu && (
              <div className="nvp__dropdown nvp__dropdown--tr">
                <div className="nvp__drop-head">SOURCE</div>
                {data.sources.map((s) => (
                  <button key={s.server}
                    className={`nvp__drop-item${activeServer === s.server ? " is-active" : ""}`}
                    onClick={() => { setActiveServer(s.server); setShowServerMenu(false); }}>
                    <span>{s.server === "megacloud" ? "☁ MegaCloud" : "⚡ UpCloud"}</span>
                    {activeServer === s.server && <CheckMark />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══════════ CLICK-TO-PLAY CENTER ══════════
             This sits BETWEEN top and bottom — clicking it toggles play.
             It does NOT use data-ui so the root onClick isn't needed at all. */}
        <div
          className="nvp__center"
          onClick={(e) => { e.stopPropagation(); closeMenus(); togglePlay(); }}
        />

        {/* ══════════ BOTTOM BAR ══════════ */}
        <div className="nvp__bottom" onClick={(e) => e.stopPropagation()}>

          {/* Seek bar */}
          <div
            className="nvp__seek"
            ref={seekBarRef}
            onMouseDown={onSeekDown}
            onMouseMove={onSeekMove}
            onMouseLeave={() => setHoverTime(null)}
          >
            {hoverTime && duration > 0 && (
              <div className="nvp__tooltip" style={{ left: `clamp(20px, ${hoverTime.x}px, calc(100% - 20px))` }}>
                {formatTime(hoverTime.time)}
              </div>
            )}
            <div className="nvp__track">
              <div className="nvp__buffer"   style={{ width: `${bufferedPct}%` }} />
              <div className="nvp__progress" style={{ width: `${progress}%`    }}>
                <div className="nvp__thumb" />
              </div>
            </div>
          </div>

          {/* Control row */}
          <div className="nvp__row">
            {/* ── LEFT ── */}
            <div className="nvp__left">
              {/* Play / Pause */}
              <button className="nvp__btn nvp__btn--play" onClick={togglePlay}>
                {isPlaying ? <Pause size={ICON_LG} /> : <Play size={ICON_LG} />}
              </button>

              {/* Skip back */}
              <button className="nvp__btn" onClick={() => skip(-10)} title="Rewind 10s (←)">
                <SkipBack size={ICON_SM} />
              </button>

              {/* Skip forward */}
              <button className="nvp__btn" onClick={() => skip(10)} title="Forward 10s (→)">
                <SkipForward size={ICON_SM} />
              </button>

              {/* Volume */}
              <div className="nvp__vol-wrap"
                onMouseEnter={() => setVolVisible(true)}
                onMouseLeave={() => setVolVisible(false)}>
                <button className="nvp__btn" onClick={toggleMute}>
                  {muted || volume === 0 ? <VolumeX size={ICON_SM} />
                    : volume < 0.5      ? <Volume1 size={ICON_SM} />
                                        : <Volume2 size={ICON_SM} />}
                </button>
                <div className={`nvp__vol-slider${volVisible ? " show" : ""}`}>
                  <input type="range" min={0} max={1} step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="nvp__range"
                    style={{ "--pct": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                  />
                </div>
              </div>

              {/* Time */}
              <div className="nvp__time">
                <span>{formatTime(currentTime)}</span>
                <span className="nvp__time-div">/</span>
                <span className="nvp__time-total">{formatTime(duration)}</span>
              </div>
            </div>

            {/* ── RIGHT ── */}
            <div className="nvp__right">

              {/* Subtitles */}
              {subtitles.length > 0 && (
                <div className="nvp__pop-wrap">
                  <button
                    className={`nvp__btn${currentSub ? " nvp__btn--on" : ""}`}
                    onClick={() => { setShowSubMenu((p) => !p); setShowQualityMenu(false); setShowServerMenu(false); }}
                    title="Subtitles">
                    <Subtitles size={ICON_SM} />
                  </button>
                  {showSubMenu && (
                    <div className="nvp__dropdown">
                      <div className="nvp__drop-head">SUBTITLES</div>
                      <button className={`nvp__drop-item${!currentSub ? " is-active" : ""}`}
                        onClick={() => { setCurrentSub(null); setShowSubMenu(false); }}>
                        <span>Off</span>{!currentSub && <CheckMark />}
                      </button>
                      {subtitles.map((sub) => (
                        <button key={sub.label}
                          className={`nvp__drop-item${currentSub === sub.file ? " is-active" : ""}`}
                          onClick={() => { setCurrentSub(sub.file); setShowSubMenu(false); }}>
                          <span>{sub.label}</span>{currentSub === sub.file && <CheckMark />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quality */}
              {qualities.length > 0 && (
                <div className="nvp__pop-wrap">
                  <button className="nvp__btn nvp__btn--qual"
                    onClick={() => { setShowQualityMenu((p) => !p); setShowSubMenu(false); setShowServerMenu(false); }}
                    title="Quality">
                    <span className="nvp__qual-tag">{activeQLabel}</span>
                  </button>
                  {showQualityMenu && (
                    <div className="nvp__dropdown">
                      <div className="nvp__drop-head">QUALITY</div>
                      <button className={`nvp__drop-item${currentQuality === -1 ? " is-active" : ""}`}
                        onClick={() => setQuality(-1)}>
                        <span>Auto</span>{currentQuality === -1 && <CheckMark />}
                      </button>
                      {[...qualities].sort((a, b) => b.height - a.height).map((q) => (
                        <button key={q.index}
                          className={`nvp__drop-item${currentQuality === q.index ? " is-active" : ""}`}
                          onClick={() => setQuality(q.index)}>
                          <span>{q.height}p</span>{currentQuality === q.index && <CheckMark />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Fullscreen */}
              <button className="nvp__btn" onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={ICON_SM} /> : <Maximize size={ICON_SM} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton / Error ──────────────────────────────────────────────────────────
function PlayerSkeleton() {
  return (
    <div className="nvp-wrap">
      <div className="nvp nvp--loading">
        <div className="nvp__spinner"><div className="nvp__ring" /></div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="nvp-wrap">
      <div className="nvp nvp--error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="52" height="52">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <p>{message}</p>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </svg>
  );
}