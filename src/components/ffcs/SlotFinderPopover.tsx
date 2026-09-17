"use client";

/**
 * SlotFinderPopover — click an empty timetable cell → list every slot code
 * that meets at that time (theory slots overlapping the period + the lab pair
 * starting there). Picking one seeds the Courses-tab search with that slot.
 */

import { useEffect, useRef } from "react";
import { Day, DAY_LABELS } from "@/lib/ffcs/types";
import { fmtTime, labPeriodRange, slotsAtCell } from "@/lib/ffcs/slots";

export interface SlotFinderCell {
  day: Day;
  periodIdx: number;
}

interface Props {
  cell: SlotFinderCell | null;
  anchor: { x: number; y: number } | null;
  campus: "vellore" | "chennai";
  onClose: () => void;
  onPick: (slot: string) => void;
}

const POPOVER_W = 300;

export function SlotFinderPopover({ cell, anchor, campus, onClose, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cell) return;
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
  }, [cell, onClose]);

  if (!cell) return null;

  const { start, end } = labPeriodRange(cell.periodIdx);
  const options = slotsAtCell(cell.day, cell.periodIdx, campus);

  const pos = (() => {
    if (!anchor) return { left: 60, top: 120 };
    const left = Math.min(Math.max(8, anchor.x - POPOVER_W / 2), window.innerWidth - POPOVER_W - 8);
    const top = Math.min(Math.max(64, anchor.y + 8), window.innerHeight - 240);
    return { left, top };
  })();

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Find courses on ${DAY_LABELS[cell.day]} at ${fmtTime(start)}`}
      className="ffcs-popover"
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <div className="font-bold" style={{ fontSize: "0.92rem" }}>
            🔍 Free period — {DAY_LABELS[cell.day].slice(0, 3)} {fmtTime(start).replace(":00", "")}–
            {fmtTime(end).replace(":00", "")}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted-ink)" }}>
            Search courses by any slot that meets here:
          </div>
        </div>
        <button className="prio-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {options.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--label-ink)" }}>
          No slot codes map to this period.
        </div>
      ) : (
        <div className="flex flex-wrap" style={{ gap: 2 }}>
          {options.map(({ slot, kind }) => (
            <button
              key={`${kind}-${slot}`}
              className="chip clickable slotfinder-chip"
              onClick={() => {
                onPick(slot);
                onClose();
              }}
              title={kind === "theory" ? "Theory slot" : "Lab period"}
            >
              <span aria-hidden>{kind === "theory" ? "📖" : "🧪"}</span> {slot}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: "0.7rem", color: "var(--label-ink)", marginTop: 6 }}>
        Tip: pick a 📖 theory slot for lecture sections, 🧪 for lab batches.
      </div>
    </div>
  );
}
