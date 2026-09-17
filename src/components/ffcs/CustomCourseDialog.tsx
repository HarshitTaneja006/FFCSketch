"use client";

/**
 * CustomCourseDialog — create a custom course (club, project, self-study,
 * elective not in the dataset…) and pencil it onto the timetable.
 *
 * The custom section is a first-class CartEntry: it renders on the grid,
 * participates in clash detection, shares, CSV export and backups.
 * Position is defined by picking one or more standard Chennai slot codes.
 *
 * Structure: the outer component only handles open/close + Esc; the inner
 * <CustomCourseForm> mounts fresh on every open, so form defaults (including
 * the auto-generated CUSTOM-n code) come from useState initializers.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import {
  CartEntry,
  CourseType,
  COURSE_TYPE_LABELS,
  DAYS,
  DAY_LABELS,
} from "@/lib/ffcs/types";
import {
  allLabSlots,
  allTheorySlots,
  fmtTime,
  getSectionMeetings,
} from "@/lib/ffcs/slots";
import { toast } from "@/hooks/use-toast";

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(45, 41, 38, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const CARD: CSSProperties = {
  position: "relative",
  width: "min(560px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "var(--card)",
  border: "3px solid var(--ffcs-ink)",
  borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
  boxShadow: "3px 4px 0 var(--shadow-ink)",
  padding: "18px 20px 20px",
  color: "var(--ffcs-ink)",
};

const CLOSE_BTN: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 12,
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "12px 4px 10px 5px / 5px 10px 4px 12px",
  background: "var(--input)",
  color: "var(--ffcs-ink)",
  cursor: "pointer",
  padding: 0,
};

const INPUT: CSSProperties = {
  width: "100%",
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "10px 6px 12px 7px",
  padding: "7px 10px",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  background: "var(--input)",
};

const LABEL: CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  marginBottom: 4,
  color: "var(--label-ink)",
};

function SlotChip({
  code,
  selected,
  usedElsewhere,
  onToggle,
}: {
  code: string;
  selected: boolean;
  usedElsewhere?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={usedElsewhere ? `Already used in your table: ${usedElsewhere}` : `Toggle slot ${code}`}
      className="chip clickable"
      style={{
        fontSize: "0.7rem",
        padding: "1px 7px",
        background: selected ? "var(--accent)" : usedElsewhere ? "var(--good-soft)" : "var(--input)",
        color: selected ? "var(--on-accent)" : "var(--ffcs-ink)",
        boxShadow: selected ? "1.5px 2px 0 var(--shadow-strong)" : undefined,
        textDecoration: usedElsewhere && !selected ? "underline dotted" : undefined,
      }}
    >
      {usedElsewhere && !selected ? "✏ " : ""}
      {code}
    </button>
  );
}

/** next free CUSTOM-n code for the given table */
function nextCustomCode(entries: CartEntry[]): string {
  let n = 1;
  const codes = new Set(entries.map((e) => e.code.toUpperCase()));
  while (codes.has(`CUSTOM-${n}`)) n++;
  return `CUSTOM-${n}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** pre-fill the slot picker (e.g. a stack built in the Slot View) */
  initialSlots?: string[];
}

export function CustomCourseDialog({ open, onClose, initialSlots }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return <CustomCourseForm onClose={onClose} initialSlots={initialSlots} />;
}

function CustomCourseForm({ onClose, initialSlots }: { onClose: () => void; initialSlots?: string[] }) {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const addSection = useFFCS((s) => s.addSection);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  const [code, setCode] = useState(() => nextCustomCode(activeTable?.entries || []));
  const [title, setTitle] = useState("");
  const [faculty, setFaculty] = useState("");
  const [credits, setCredits] = useState("3");
  const [type, setType] = useState<CourseType>("TH");
  const [picked, setPicked] = useState<string[]>(() =>
    Array.isArray(initialSlots) ? [...new Set(initialSlots)] : []
  );

  /* slots already occupied by the current table (shown with a ✏ stamp) */
  const usedSlots = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of activeTable?.entries || []) {
      for (const c of e.slot.split("+")) {
        const k = c.trim();
        if (k && !map.has(k)) map.set(k, `${e.code} · ${e.faculty}`);
      }
    }
    return map;
  }, [activeTable]);

  const toggleSlot = (c: string) =>
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const slotString = picked.length > 0 ? picked.join("+") : "NIL";

  /** live preview: weekly meetings of the picked slots */
  const meetings = useMemo(() => {
    if (picked.length === 0) return [];
    return getSectionMeetings(slotString, "chennai").sort(
      (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start - b.start
    );
  }, [picked, slotString]);

  /** live clash check against the current table */
  const clashEntries = useMemo(() => {
    if (picked.length === 0 || !activeTable) return [];
    const out: string[] = [];
    const ms = getSectionMeetings(slotString, "chennai");
    for (const e of activeTable.entries) {
      const ems = getSectionMeetings(e.slot, "chennai");
      if (ms.some((m) => ems.some((em) => em.day === m.day && em.start < m.end && m.start < em.end))) {
        out.push(`${e.code} (${e.faculty})`);
      }
    }
    return out;
  }, [picked, slotString, activeTable]);

  const titleOk = title.trim().length > 0;
  const slotsOk = picked.length > 0;
  const creditsNum = Math.min(20, Math.max(0, parseFloat(credits) || 0));

  const handleSave = () => {
    if (!titleOk) {
      toast({ title: "Give your custom course a title", variant: "destructive" });
      return;
    }
    if (!slotsOk) {
      toast({
        title: "Pick at least one slot",
        description: "Custom courses need at least one slot code to appear on the grid.",
        variant: "destructive",
      });
      return;
    }
    const section = {
      id: -Date.now(), // negative ids never collide with the dataset
      code: (code.trim() || "CUSTOM").toUpperCase(),
      title: title.trim(),
      type,
      credits: creditsNum,
      slot: slotString,
      faculty: faculty.trim() || "Custom / TBA",
    };
    const res = addSection(section);
    if (!res.ok) {
      toast({ title: res.reason, variant: "destructive" });
      return;
    }
    toast({
      title: `Added ${section.code} ✏️`,
      description:
        clashEntries.length > 0
          ? `⚠ clashes with ${clashEntries.join(", ")}`
          : `${section.slot} penciled onto your timetable`,
      variant: clashEntries.length > 0 ? "destructive" : "default",
    });
    onClose();
  };

  const theorySlots = allTheorySlots();
  const labSlots = allLabSlots();
  const morningTheory = theorySlots.filter((c) => c.endsWith("1"));
  const afternoonTheory = theorySlots.filter((c) => !c.endsWith("1"));

  return (
    <div style={OVERLAY} onClick={onClose} role="presentation">
      <div
        style={CARD}
        role="dialog"
        aria-modal="true"
        aria-label="Create a custom course"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" style={CLOSE_BTN} onClick={onClose} aria-label="Close" title="Close (Esc)">
          <X size={16} />
        </button>

        <h3 style={{ margin: "0 0 2px", fontSize: "1.05rem" }}>✏️ Create a custom course</h3>
        <p className="ffcs-label" style={{ margin: "0 0 12px" }}>
          club · project · self-study — anything that needs a weekly spot
        </p>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={LABEL} htmlFor="cc-title">Title *</label>
            <input
              id="cc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dota2 Strategy Club"
              style={INPUT}
              autoFocus
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="cc-code">Course code</label>
            <input
              id="cc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CUSTOM-1"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="cc-faculty">Faculty / in-charge</label>
            <input
              id="cc-faculty"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              placeholder="Custom / TBA"
              style={INPUT}
            />
          </div>
          <div className="flex gap-2">
            <div style={{ width: 90 }}>
              <label style={LABEL} htmlFor="cc-credits">Credits</label>
              <input
                id="cc-credits"
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                style={INPUT}
              />
            </div>
            <div className="flex-1">
              <label style={LABEL} htmlFor="cc-type">Type</label>
              <select
                id="cc-type"
                value={type}
                onChange={(e) => setType(e.target.value as CourseType)}
                style={{ ...INPUT, height: 36 }}
              >
                {Object.entries(COURSE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {(type === "ETH" || type === "ELA") && (
                <p
                  role="note"
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--danger)",
                    margin: "4px 0 0",
                    lineHeight: 1.35,
                  }}
                >
                  ⚠ Embedded {type === "ETH" ? "theory" : "lab"} — also create the{" "}
                  <strong>{type === "ETH" ? "ELA" : "ETH"}</strong> half of this course,{" "}
                  <strong>same faculty</strong>.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* slot picker */}
        <div className="mt-3">
          <label style={LABEL}>
            Slots * <span style={{ fontWeight: 400 }}>— tap to add ({picked.length} picked)</span>
          </label>
          {picked.length > 0 && (
            <div
              className="p-2 mb-2 flex flex-wrap items-center gap-1"
              style={{ border: "2px dashed var(--accent)", borderRadius: 8, background: "var(--flex-bg)" }}
            >
              <span style={{ fontSize: "0.74rem", fontWeight: 700, marginRight: 4 }}>picked:</span>
              {picked.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleSlot(c)}
                  className="chip clickable"
                  title={`Remove ${c}`}
                  style={{ fontSize: "0.7rem", background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  {c} ✕
                </button>
              ))}
            </div>
          )}
          <div
            className="p-2 ffcs-scroll"
            style={{ border: "2px solid var(--cell-border)", borderRadius: 8, maxHeight: 180, overflowY: "auto" }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--label-ink)", marginBottom: 3 }}>
              Theory slots (morning → noon)
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {morningTheory.map((c) => (
                <SlotChip
                  key={c}
                  code={c}
                  selected={picked.includes(c)}
                  usedElsewhere={usedSlots.get(c)}
                  onToggle={() => toggleSlot(c)}
                />
              ))}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--label-ink)", marginBottom: 3 }}>
              Theory slots (afternoon → evening)
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {afternoonTheory.map((c) => (
                <SlotChip
                  key={c}
                  code={c}
                  selected={picked.includes(c)}
                  usedElsewhere={usedSlots.get(c)}
                  onToggle={() => toggleSlot(c)}
                />
              ))}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--label-ink)", marginBottom: 3 }}>
              Lab periods (50 min each)
            </div>
            <div className="flex flex-wrap gap-1">
              {labSlots.map((c) => (
                <SlotChip
                  key={c}
                  code={c}
                  selected={picked.includes(c)}
                  usedElsewhere={usedSlots.get(c)}
                  onToggle={() => toggleSlot(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* live preview */}
        {meetings.length > 0 && (
          <div
            className="p-2 mt-2"
            style={{ border: "2px dashed var(--cell-border)", borderRadius: 8, background: "var(--flex-bg)", fontSize: "0.78rem" }}
          >
            <strong>Weekly footprint:</strong>{" "}
            {meetings
              .map((m) => `${DAY_LABELS[m.day].slice(0, 3)} ${fmtTime(m.start)}-${fmtTime(m.end)}${m.isLab ? " 🧪" : ""}`)
              .join(" · ")}
            {clashEntries.length > 0 && (
              <div style={{ color: "var(--danger)", fontWeight: "bold", marginTop: 3 }}>
                ⚠ overlaps: {clashEntries.join(", ")}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              background: "var(--input)",
              fontFamily: "inherit",
              padding: "6px 14px",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!titleOk || !slotsOk}
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              background: titleOk && slotsOk ? "var(--good)" : "var(--tt6)",
              color: titleOk && slotsOk ? "var(--on-accent, #fff)" : "var(--muted-ink)",
              fontFamily: "inherit",
              padding: "6px 16px",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: titleOk && slotsOk ? "pointer" : "not-allowed",
              boxShadow: titleOk && slotsOk ? "2px 3px 0 var(--shadow-strong)" : undefined,
            }}
          >
            ➕ Add to timetable
          </button>
        </div>
      </div>
    </div>
  );
}
