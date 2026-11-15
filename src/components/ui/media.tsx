"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/** Site icon from arbitrary domains; falls back to a globe glyph. */
export function Favicon({ src, domain, className }: { src: string | null | undefined; domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-mist text-slate", className)}
        title={domain}
      >
        <Globe className="size-3" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- favicons come from arbitrary domains
    <img
      src={src}
      alt=""
      aria-hidden
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("size-4 shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}

const TILE_TONES = ["bg-sky-soft text-cobalt", "bg-mist text-ink", "bg-sky/25 text-ink", "bg-rule/70 text-cobalt"];

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Option image with a lettered tile fallback. Images come from arbitrary domains. */
export function OptionThumb({
  name,
  image,
  className,
  rounded = "rounded-control",
}: {
  name: string;
  image: { url: string; alt?: string } | null | undefined;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!image?.url || failed) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center font-semibold tracking-tight",
          TILE_TONES[hash(name) % TILE_TONES.length],
          rounded,
          className,
        )}
      >
        <span className="text-[0.9em]">{initials(name)}</span>
      </div>
    );
  }
  return (
    <div className={cn("shrink-0 overflow-hidden border border-rule bg-paper", rounded, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- option images come from arbitrary domains */}
      <img
        src={image.url}
        alt={image.alt || name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-contain p-1"
      />
    </div>
  );
}
