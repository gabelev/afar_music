"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One track row with play/pause. Plain <audio> under the hood; only one
 * track plays at a time per page (browser handles the rest).
 */
export function TrackPlayer({
  title,
  audioUrl,
  isSingle = false,
  subtitle,
}: {
  title: string;
  audioUrl: string;
  isSingle?: boolean;
  subtitle?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => {
      // Pause every other player on the page.
      document.querySelectorAll("audio").forEach((other) => {
        if (other !== el) other.pause();
      });
      setPlaying(true);
    };
    const onStop = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onStop);
    el.addEventListener("ended", onStop);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onStop);
      el.removeEventListener("ended", onStop);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "var(--space-2) var(--space-3)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <button
        type="button"
        className="btn btn-primary btn-icon"
        onClick={toggle}
        disabled={!audioUrl}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="card-title">{title}</span>
          {isSingle && <span className="tag tag-outline">The Single</span>}
        </div>
        {subtitle && <div className="card-meta">{subtitle}</div>}
      </div>
      <audio ref={audioRef} src={audioUrl} preload="none" />
    </div>
  );
}
