"use client";

/**
 * ColorPicker — hand-drawn palette swatches for per-course block colors.
 * Palette indices match the timetable pastels (--tt0 … --tt9).
 * Used inside BlockPopover and as a standalone mini popover from CourseCart.
 */

import { useEffect, useRef } from "react";
import { Eraser } from "lucide-react";

export const PALETTE_COUNT = 10;

interface PickerProps {
  /** current palette index for this course, or null = auto (hash color) */
  value: number | null;
  onPick: (idx: number | null) => void;
}

export function ColorPicker({ value, onPick }: PickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Block color">
      {Array.from({ length: PALETTE_COUNT }, (_, i) => (
        <button
          key={i}
          className={`swatch${value === i ? " picked" : ""}`}
          style={{ background: `var(--tt${i})` }}
          onClick={() => onPick(i)}
          aria-label={`Color ${i + 1}`}
          aria-pressed={value === i}
          title={`Crayon ${i + 1}`}
        />
      ))}
      <button
        className={`swatch swatch-auto${value === null ? " picked" : ""}`}
        onClick={() => onPick(null)}
        aria-label="Automatic color"
        aria-pressed={value === null}
        title="Automatic color"
      >
        <Eraser size={11} />
      </button>
    </div>
  );
}

interface PopoverProps extends PickerProps {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  /** label shown at the top of the mini popover */
  label: string;
}

const POPOVER_W = 208;

/** Small fixed-position popover wrapping the palette (viewport-clamped). */
export function SwatchPopover({ anchor, onClose, value, onPick, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!label) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, label]);

  /** nothing selected → render nothing (prevents an invisible floating palette) */
  if (!label) return null;

  const pos = (() => {
    if (!anchor) return { left: 40, top: 120 };
    const left = Math.min(Math.max(8, anchor.x - POPOVER_W / 2), window.innerWidth - POPOVER_W - 8);
    const top = Math.min(Math.max(64, anchor.y + 8), window.innerHeight - 130);
    return { left, top };
  })();

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Pick a color for ${label}`}
      className="ffcs-popover"
      style={{ left: pos.left, top: pos.top, width: POPOVER_W, padding: 10 }}
    >
      <div className="ffcs-label" style={{ marginBottom: 6, fontSize: "0.7rem" }}>
        ✏️ color — {label}
      </div>
      <ColorPicker value={value} onPick={onPick} />
    </div>
  );
}
