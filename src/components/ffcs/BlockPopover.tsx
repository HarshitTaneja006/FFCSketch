"use client";

/**
 * BlockPopover — click a timetable block → hand-drawn popover with:
 *  - course details (slot, type, credits, faculty, venue)
 *  - Remove button
 *  - sibling sections (same code + type) with clash-aware one-click Swap
 *  - per-course crayon color
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, RefreshCw, Trash2, X } from "lucide-react";
import { Campus, CourseSection, COURSE_TYPE_LABELS } from "@/lib/ffcs/types";
import { clashWithEntries } from "@/lib/ffcs/timetable";
import { getSectionsByCode } from "@/lib/ffcs/courseData";
import { toast } from "@/hooks/use-toast";
import { CartEntry } from "@/lib/ffcs/types";
import { useFFCS } from "@/store/ffcs";
import { ColorPicker } from "./ColorPicker";

interface Props {
  block: {
    uid: string;
    code: string;
    title: string;
    type: string;
    faculty: string;
    slotLabel: string;
    credits: number;
    venue?: string;
  } | null;
  anchor: { x: number; y: number } | null;
  entries: CartEntry[];
  campus: Campus;
  onClose: () => void;
  onRemove: (uid: string) => void;
  onSwap: (removedUid: string, section: CourseSection) => void;
}

const POPOVER_W = 330;

export function BlockPopover({ block, anchor, entries, campus, onClose, onRemove, onSwap }: Props) {
  /** sibling sections from the local dataset — derived (instant, no network) */
  const sections = useMemo(
    () => (block ? getSectionsByCode(block.code, block.type) : []),
    [block]
  );
  const ref = useRef<HTMLDivElement>(null);

  const courseColors = useFFCS((s) => s.courseColors);
  const setCourseColor = useFFCS((s) => s.setCourseColor);

  // position with viewport clamping
  const pos = (() => {
    if (!anchor) return { left: 40, top: 90 };
    const left = Math.min(Math.max(8, anchor.x - POPOVER_W / 2), window.innerWidth - POPOVER_W - 8);
    const top = Math.min(Math.max(64, anchor.y + 10), window.innerHeight - 380);
    return { left, top };
  })();

  useEffect(() => {
    if (!block) return;
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
  }, [block, onClose]);

  if (!block) return null;

  /** the exact cart entry this block belongs to (full slot string) */
  const currentEntry = entries.find((e) => e.uid === block.uid);
  /** entries excluding the current one — used for swap clash preview */
  const others = entries.filter((e) => e.uid !== block.uid);
  /** sibling sections: same course+type, different faculty+slot offering */
  const siblings = sections.filter(
    (s) => !(currentEntry && s.faculty === currentEntry.faculty && s.slot === currentEntry.slot)
  );

  const colorKey = block ? `${block.code}|${block.type}` : "";
  const currentColor = courseColors[colorKey] ?? null;

  const handleSwap = (section: CourseSection) => {
    const clashing = clashWithEntries(section, others, campus);
    if (clashing.length > 0) {
      toast({
        title: "That section clashes too!",
        description: `${section.slot} · ${section.faculty}`,
        variant: "destructive",
      });
      return;
    }
    onSwap(block.uid, section);
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Options for ${block.code}`}
      className="ffcs-popover"
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="font-bold" style={{ fontSize: "0.95rem" }}>
            {block.code} <span style={{ opacity: 0.6 }}>· {block.slotLabel}</span>
          </div>
          <div className="truncate" style={{ fontSize: "0.8rem", opacity: 0.8 }} title={block.title}>
            {block.title}
          </div>
        </div>
        <button className="prio-btn" onClick={onClose} aria-label="Close">
          <X size={13} />
        </button>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--muted-ink)", marginBottom: 8 }}>
        {COURSE_TYPE_LABELS[block.type as keyof typeof COURSE_TYPE_LABELS] || block.type} ·{" "}
        {block.credits} credits · currently <strong>{block.faculty}</strong>
        {block.venue && (
          <div style={{ marginTop: 2 }}>
            <MapPin size={11} className="inline" style={{ verticalAlign: "-1px" }} />{" "}
            <strong>{block.venue}</strong>
          </div>
        )}
      </div>

      {/* actions */}
      <button
        className="w-full mb-2"
        onClick={() => {
          onRemove(block.uid);
          onClose();
        }}
        style={{
          border: "2px solid var(--danger)",
          color: "var(--danger)",
          background: "var(--bad)",
          borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
          fontFamily: "inherit",
          fontSize: "0.85rem",
          padding: "5px",
          cursor: "pointer",
        }}
      >
        <Trash2 size={13} className="inline mr-1" /> Remove from table
      </button>

      {/* per-course color */}
      <div style={{ marginBottom: 8 }}>
        <div className="ffcs-label" style={{ marginBottom: 4 }}>
          ✏️ Crayon color for {block.code}
        </div>
        <ColorPicker value={currentColor} onPick={(idx) => setCourseColor(colorKey, idx)} />
      </div>

      {/* sibling sections */}
      <div className="ffcs-label" style={{ marginBottom: 4 }}>
        Other sections ({siblings.length}) — swap without leaving the grid:
      </div>
      <div className="ffcs-scroll" style={{ maxHeight: 230, overflowY: "auto", marginBottom: 8 }}>
        {siblings.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--label-ink)", padding: "4px 2px" }}>
            No other sections for this course — it is what it is 🙂
          </div>
        ) : (
          siblings.map((s) => {
            const clashing = clashWithEntries(s, others, campus);
            return (
              <button
                key={s.id}
                onClick={() => handleSwap(s)}
                disabled={clashing.length > 0}
                className="swap-row"
                title={clashing.length ? "Clashes with your table" : "Swap to this section"}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px",
                  marginBottom: 4,
                  background: clashing.length > 0 ? "var(--bad-soft)" : "var(--good-soft)",
                  border: `2px solid ${clashing.length > 0 ? "var(--danger)" : "var(--good-strong)"}`,
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: "0.78rem",
                  cursor: clashing.length > 0 ? "not-allowed" : "pointer",
                  opacity: clashing.length > 0 ? 0.65 : 1,
                  textAlign: "left",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.faculty}</strong>
                  <span style={{ opacity: 0.75 }}> · {s.slot}</span>
                </span>
                {clashing.length > 0 ? (
                  <span style={{ color: "var(--danger)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>✗ clash</span>
                ) : (
                  <RefreshCw size={13} style={{ color: "var(--good-strong)", flexShrink: 0 }} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
