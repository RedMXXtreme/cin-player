"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Hls, { Level } from "hls.js";
import "./player.css";

const M3U8_PROXY = "https://cin-m3u8-proxy-production.up.railway.app/m3u8-proxy?url=";
const MAPPER_BASE = "https://zero-mapper.vercel.app";
const SERVERS = ["megacloud", "upcloud"] as const;
type Server = (typeof SERVERS)[number];

interface Subtitle {
  file: string;
  label: string;
  kind: string;
  default?: boolean;
}

interface Source {
  server: string;
  url: string;
  isM3U8: boolean;
  quality: string;
  subtitles: Subtitle[];
}

interface EpisodeData {
  title: string;
  episodeName: string;
  episode: string;
  season: number;
  number: number;
  description: string;
  tmdbPosterUrl: string;
  tmdbBackdropUrl: string;
  sources: Source[];
}

interface QualityLevel {
  index: number;       // hls.js level index (-1 = auto)
  label: string;       // "1080p", "720p", "Auto", etc.
  bitrate: number;     // bps (0 for auto)
  height: number;      // 0 for auto
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>;
const IconPause = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>;
const IconPlayLg = () => <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>;
const IconPauseLg = () => <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>;
const IconBack10 = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>;
const IconFwd10 = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>;
const IconVolOff = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>;
const IconVolLow = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>;
const IconVolHigh = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;
const IconFullscreen = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>;
const IconExitFullscreen = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>;
const IconCheck = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style={{flexShrink:0}}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>;
const IconSubs = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 6H6V8h6v2zm8 4H6v-2h14v2zm0-4h-5V8h5v2z"/></svg>;
const IconArrowLeft = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>;
const IconQuality = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>;

// ─── Utility ──────────────────────────────────────────────────────────────────
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec}` : `${m}:${sec}`;
};

const formatBitrate = (bps: number) => {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kbps`;
  return `${bps} bps`;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const { params: segments = [] } = useParams<{ params: string[] }>();
  const router = useRouter();

  const type    = segments[0];
  const id      = segments[1];
  const season  = segments[2];
  const episode = segments[3];
  const isMovie = type === "movie";

  const apiUrl = isMovie
    ? `${MAPPER_BASE}/movie/${id}`
    : `${MAPPER_BASE}/tv/${id}/${season}/${episode}`;

  const videoRef  = useRef<HTMLVideoElement>(null);
  const hlsRef    = useRef<Hls | null>(null);
  const shellRef  = useRef<HTMLDivElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [data,          setData]          = useState<EpisodeData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [activeServer,  setActiveServer]  = useState<Server>("megacloud");
  const [activeSub,     setActiveSub]     = useState<string>("English");
  const [showSubs,      setShowSubs]      = useState(false);
  const [showSrvMenu,   setShowSrvMenu]   = useState(false);
  const [showQuality,   setShowQuality]   = useState(false);

  // Quality state
  const [qualityLevels,    setQualityLevels]    = useState<QualityLevel[]>([]);
  const [selectedQuality,  setSelectedQuality]  = useState<number>(-1);   // -1 = auto
  const [currentQuality,   setCurrentQuality]   = useState<number>(-1);   // actual playing level
  const [estimatedBitrate, setEstimatedBitrate] = useState<number>(0);    // bw estimate

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [volume,       setVolume]       = useState(1);
  const [isMuted,      setIsMuted]      = useState(false);
  const [buffered,     setBuffered]     = useState(0);
  const [ctrlVisible,  setCtrlVisible]  = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverInfo,    setHoverInfo]    = useState<{x:number; t:number} | null>(null);

  // ─── Controls visibility ───────────────────────────────────────────────────
  const keepControls = useCallback(() => {
    setCtrlVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCtrlVisible(false), 3500);
  }, []);

  useEffect(() => {
    if (showSubs || showSrvMenu || showQuality) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCtrlVisible(true);
    }
  }, [showSubs, showSrvMenu, showQuality]);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!type || !id) return;
    if (!isMovie && (!season || !episode)) return;
    setLoading(true);
    setError(null);
    fetch(apiUrl)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: EpisodeData) => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [apiUrl]);

  // ─── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const video = videoRef.current;
    if (!video) return;

    const onPlay       = () => setIsPlaying(true);
    const onPause      = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0 && video.duration > 0) {
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      }
    };
    const onDuration = () => { if (isFinite(video.duration) && video.duration > 0) setDuration(video.duration); };
    const onMeta     = () => { if (isFinite(video.duration) && video.duration > 0) setDuration(video.duration); };
    const onVolume   = () => { setVolume(video.volume); setIsMuted(video.muted); };

    video.addEventListener("play",           onPlay);
    video.addEventListener("pause",          onPause);
    video.addEventListener("timeupdate",     onTimeUpdate);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("volumechange",   onVolume);
    return () => {
      video.removeEventListener("play",           onPlay);
      video.removeEventListener("pause",          onPause);
      video.removeEventListener("timeupdate",     onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("volumechange",   onVolume);
    };
  }, [data]);

  // ─── HLS loader + quality wiring ──────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const video = videoRef.current;
    if (!video) return;
    const source = data.sources.find(s => s.server === activeServer);
    if (!source) return;

    const proxied = M3U8_PROXY + encodeURIComponent(source.url);
    setCurrentTime(0); setDuration(0); setBuffered(0); setIsPlaying(false);
    setQualityLevels([]); setSelectedQuality(-1); setCurrentQuality(-1); setEstimatedBitrate(0);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // ABR tuning — react faster to bandwidth changes
        abrEwmaDefaultEstimate: 1_000_000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.7,
      });
      hlsRef.current = hls;
      hls.loadSource(proxied);
      hls.attachMedia(video);

      // Build quality list once manifest is parsed
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels: QualityLevel[] = data.levels
          .map((l: Level, i: number) => ({
            index: i,
            label: l.height ? `${l.height}p` : `Level ${i + 1}`,
            bitrate: l.bitrate,
            height: l.height,
          }))
          // Sort highest quality first
          .sort((a: QualityLevel, b: QualityLevel) => b.height - a.height);

        // Deduplicate by height (keep highest bitrate variant)
        const seen = new Set<number>();
        const unique = levels.filter((l: QualityLevel) => {
          if (seen.has(l.height)) return false;
          seen.add(l.height);
          return true;
        });

        setQualityLevels(unique);
        setSelectedQuality(-1); // start on auto
        hls.currentLevel = -1;  // ABR auto
        video.play().catch(() => {});
      });

      // Track which level is actually playing
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentQuality(data.level);
      });

      // Track estimated bandwidth for "Auto" label
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (hls.bandwidthEstimate) {
          setEstimatedBitrate(Math.round(hls.bandwidthEstimate));
        }
      });

    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari) — no level API
      video.src = proxied;
      video.play().catch(() => {});
    }
  }, [data, activeServer]);

  // Apply quality selection change
  const applyQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    setSelectedQuality(levelIndex);
    if (levelIndex === -1) {
      // Auto — let ABR decide
      hls.currentLevel = -1;
      hls.loadLevel = -1;
    } else {
      // Lock to specific level
      hls.currentLevel = levelIndex;
      hls.loadLevel = levelIndex;
    }
    setShowQuality(false);
  }, []);

  // ─── Subtitle tracks ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const video = videoRef.current;
    if (!video) return;
    const source = data.sources.find(s => s.server === activeServer);
    if (!source) return;

    Array.from(video.querySelectorAll("track")).forEach(t => t.remove());
    source.subtitles.forEach(sub => {
      const t = document.createElement("track");
      t.src = sub.file; t.label = sub.label;
      t.kind = "subtitles"; t.srclang = sub.label.slice(0, 2).toLowerCase();
      video.appendChild(t);
    });
    setTimeout(() => {
      Array.from(video.textTracks).forEach(t => {
        t.mode = t.label === activeSub ? "showing" : "hidden";
      });
    }, 150);
  }, [data, activeServer, activeSub]);

  // ─── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.code) {
        case "Space": case "KeyK": e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case "ArrowLeft":  e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); break;
        case "ArrowRight": e.preventDefault(); v.currentTime = Math.min(v.duration||0, v.currentTime + 10); break;
        case "KeyM": v.muted = !v.muted; break;
        case "KeyF":
          if (shellRef.current) {
            document.fullscreenElement ? document.exitFullscreen() : shellRef.current.requestFullscreen();
          }
          break;
      }
      keepControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keepControls]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (v) v.paused ? v.play() : v.pause();
  }, []);

  const skip = useCallback((secs: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration||0, v.currentTime + secs));
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!shellRef.current) return;
    document.fullscreenElement ? document.exitFullscreen() : shellRef.current.requestFullscreen();
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
  }, [duration]);

  const onProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHoverInfo({ x: e.clientX - r.left, t: pct * duration });
  }, [duration]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const activeSource = data?.sources.find(s => s.server === activeServer);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Label shown on the quality trigger button
  const currentQualityLabel = selectedQuality === -1
    ? "Auto"
    : qualityLevels.find(q => q.index === selectedQuality)?.label ?? "Auto";

  // The level currently playing (for the "Auto · 1080p" sub-label)
  const playingLevel = qualityLevels.find(q => q.index === currentQuality);

  const VolumeIcon = () => {
    if (isMuted || volume === 0) return <IconVolOff />;
    if (volume < 0.5) return <IconVolLow />;
    return <IconVolHigh />;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="player-loading">
        <div className="loader-ring" />
        <p className="loader-text">{isMovie ? "Loading movie" : "Loading episode"}</p>
      </div>
    );

  if (error)
    return (
      <div className="player-loading">
        <p className="loader-error">Error: {error}</p>
      </div>
    );

  return (
    <div
      ref={shellRef}
      className="player-shell"
      onMouseMove={keepControls}
      onMouseLeave={() => { if (!showSubs && !showSrvMenu && !showQuality) setCtrlVisible(false); }}
    >
      <video ref={videoRef} className="video-el" crossOrigin="anonymous" playsInline onClick={togglePlay} />

      <div className="controls-layer" style={{ pointerEvents: "none" }}>

        {/* ── Top bar ── */}
        <div className={`ctrl-top ${ctrlVisible ? "visible" : ""}`} style={{ pointerEvents: "all" }}>
          <button className="back-btn" onClick={() => router.back()} title="Go back">
            <IconArrowLeft />
          </button>
          <div className="top-meta">
            <span className="top-title">{data?.title}</span>
            {!isMovie && data?.episodeName && (
              <span className="top-ep">S{season} · E{episode} · {data.episodeName}</span>
            )}
          </div>
        </div>

        {/* ── Center click zone ── */}
        <div className="ctrl-center-zone" style={{ pointerEvents: "all" }} onClick={togglePlay}>
          <div className="play-indicator">
            {isPlaying ? <IconPauseLg /> : <IconPlayLg />}
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div className={`ctrl-bottom ${ctrlVisible ? "visible" : ""}`} style={{ pointerEvents: "all" }}>

          {/* Progress */}
          <div
            className="progress-wrap"
            onClick={seek}
            onMouseMove={onProgressHover}
            onMouseLeave={() => setHoverInfo(null)}
          >
            {hoverInfo && duration > 0 && (
              <div className="time-tooltip" style={{ left: `${hoverInfo.x}px` }}>{fmt(hoverInfo.t)}</div>
            )}
            <div className="progress-track">
              <div className="progress-buffer" style={{ width: `${buffered}%` }} />
              <div className="progress-played" style={{ width: `${progress}%` }}>
                <div className="progress-thumb" />
              </div>
            </div>
          </div>

          {/* Control row */}
          <div className="ctrl-row">

            <button className="ctrl-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>
            <button className="ctrl-btn" onClick={() => skip(-10)} title="Rewind 10s"><IconBack10 /></button>
            <button className="ctrl-btn" onClick={() => skip(10)} title="Forward 10s"><IconFwd10 /></button>

            <div className="vol-group">
              <button className="ctrl-btn" onClick={toggleMute} title="Mute"><VolumeIcon /></button>
              <div className="vol-slider-wrap">
                <input
                  type="range" min="0" max="1" step="0.02"
                  value={isMuted ? 0 : volume} className="vol-slider"
                  onChange={e => {
                    const v = videoRef.current;
                    if (v) { v.volume = +e.target.value; v.muted = false; }
                  }}
                />
              </div>
            </div>

            <span className="time-display">
              <span className="time-current">{fmt(currentTime)}</span>
              <span className="time-sep"> / </span>
              <span className="time-total">{fmt(duration)}</span>
            </span>

            <div className="ctrl-spacer" />

            {/* ── Quality selector ── */}
            {qualityLevels.length > 0 && (
              <div className="menu-wrap">
                <button
                  className={`quality-trigger ${showQuality ? "open" : ""}`}
                  onClick={() => { setShowQuality(v => !v); setShowSubs(false); setShowSrvMenu(false); }}
                  title="Quality"
                >
                  <IconQuality />
                  <span className="quality-trigger-label">{currentQualityLabel}</span>
                  {selectedQuality === -1 && playingLevel && (
                    <span className="quality-trigger-sub">{playingLevel.label}</span>
                  )}
                  <svg className="quality-trigger-chevron" viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
                    <path d="M7 10l5 5 5-5z"/>
                  </svg>
                </button>

                {showQuality && (
                  <div className="quality-dropdown">
                    <div className="quality-dropdown-head">
                      <span className="quality-dropdown-label">Quality</span>
                      {estimatedBitrate > 0 && (
                        <span className="quality-bw-badge">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9">
                            <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                          </svg>
                          {formatBitrate(estimatedBitrate)}
                        </span>
                      )}
                    </div>

                    <div className="quality-list">
                      {/* Auto option */}
                      <button
                        className={`quality-item ${selectedQuality === -1 ? "active" : ""}`}
                        onClick={() => applyQuality(-1)}
                      >
                        <div className="quality-item-left">
                          <span className="quality-auto-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                            </svg>
                          </span>
                          <div className="quality-item-info">
                            <span className="quality-item-label">Auto</span>
                            <span className="quality-item-sub">
                              {selectedQuality === -1 && playingLevel
                                ? `Playing ${playingLevel.label}`
                                : "Adjusts to network"}
                            </span>
                          </div>
                        </div>
                        <div className="quality-item-right">
                          {selectedQuality === -1 && (
                            <span className="quality-active-dot" />
                          )}
                        </div>
                      </button>

                      <div className="quality-divider" />

                      {/* Specific quality levels */}
                      {qualityLevels.map(q => {
                        const isActive = selectedQuality === q.index;
                        const isPlaying = currentQuality === q.index && selectedQuality === -1;
                        return (
                          <button
                            key={q.index}
                            className={`quality-item ${isActive ? "active" : ""}`}
                            onClick={() => applyQuality(q.index)}
                          >
                            <div className="quality-item-left">
                              <span className={`quality-badge ${q.height >= 1080 ? "hd" : q.height >= 720 ? "sd" : "ld"}`}>
                                {q.height >= 1080 ? "HD" : q.height >= 720 ? "SD" : "LD"}
                              </span>
                              <div className="quality-item-info">
                                <span className="quality-item-label">{q.label}</span>
                                <span className="quality-item-sub">{formatBitrate(q.bitrate)}</span>
                              </div>
                            </div>
                            <div className="quality-item-right">
                              {isPlaying && !isActive && (
                                <span className="quality-playing-tag">playing</span>
                              )}
                              {isActive && <span className="quality-active-dot" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Server switcher ── */}
            <div className="menu-wrap">
              <button
                className={`server-trigger ${showSrvMenu ? "open" : ""}`}
                onClick={() => { setShowSrvMenu(v => !v); setShowSubs(false); setShowQuality(false); }}
                title="Switch server"
              >
                <span className="server-trigger-dot" />
                <span style={{ textTransform: "capitalize" }}>{activeServer}</span>
                <svg className="server-trigger-chevron" viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>

              {showSrvMenu && (
                <div className="server-dropdown">
                  <div className="server-dropdown-head">
                    <span className="server-dropdown-label">Select Server</span>
                    <span className="server-live-badge">
                      <span className="server-live-dot" />
                      Live
                    </span>
                  </div>
                  <div className="server-list">
                    {SERVERS.map((srv, i) => (
                      <button
                        key={srv}
                        className={`server-item ${activeServer === srv ? "active" : ""}`}
                        onClick={() => { setActiveServer(srv); setShowSrvMenu(false); }}
                      >
                        <div className="server-icon-wrap">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M4 1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm0 8h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zm0 8h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"/>
                          </svg>
                        </div>
                        <div className="server-info">
                          <span className="server-name">{srv}</span>
                          <span className="server-sub">HD · Stream {i + 1}</span>
                        </div>
                        <div className="server-right">
                          <span className="server-status online" />
                          {activeServer === srv && (
                            <span className="server-check">
                              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Subtitles ── */}
            <div className="menu-wrap">
              <button
                className={`ctrl-btn pill-btn ${showSubs ? "active" : ""}`}
                onClick={() => { setShowSubs(v => !v); setShowSrvMenu(false); setShowQuality(false); }}
              >
                <IconSubs />
                <span>Subtitles</span>
              </button>
              {showSubs && (
                <div className="dropdown dropdown-subs">
                  <div className="dropdown-header">Subtitles</div>
                  <button
                    className={`dropdown-item ${activeSub === "off" ? "selected" : ""}`}
                    onClick={() => { setActiveSub("off"); setShowSubs(false); }}
                  >
                    {activeSub === "off" && <IconCheck />}
                    Off
                  </button>
                  {activeSource?.subtitles.map(sub => (
                    <button
                      key={sub.label}
                      className={`dropdown-item ${activeSub === sub.label ? "selected" : ""}`}
                      onClick={() => { setActiveSub(sub.label); setShowSubs(false); }}
                    >
                      {activeSub === sub.label && <IconCheck />}
                      <span style={{ flex: 1 }}>{sub.label}</span>
                      {sub.default && <span className="def-badge">default</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Fullscreen ── */}
            <button className="ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">
              {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}