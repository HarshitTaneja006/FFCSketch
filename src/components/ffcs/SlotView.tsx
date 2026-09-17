"use client";

/**
 * SlotView — interactive slot combiner (FFCS-inator style, rebuilt for Chennai).
 *
 * Stack any number of slot codes onto a live weekly grid to check whether a
 * slot combination is clash-free BEFORE you hunt for course sections.
 * - tap slot chips (theory + lab) to toggle them onto the grid
 * - overlapping slots light up as red conflict cells with pair tooltips
 * - "load my table" imports the slots your current table already uses
 * - a clash-free stack can be turned into a custom course in one click
 *
 * The grid honours the SAME persisted orientation preference as the Timetable
 * tab (`gridOrientation` in the store) — toggling here syncs there and back.
 */

import { useMemo, useState } from "react";
import { Eraser, Pencil, Search, Table2 } from "lucide-react";
import {
  DAYS,
  DAY_LABELS,
  Day,
} from "@/lib/ffcs/types";
import {
  allLabSlots,
  allTheorySlots,
  fmtTime,
  fmtTimeShort,
  labPeriodRange,
  L_SLOT_MAP,
  LUNCH_LABEL,
  MORNING_ROWS,
  SLOT_MEETINGS,
  TOTAL_ROWS,
} from "@/lib/ffcs/slots";
import { useFFCS } from "@/store/ffcs";

interface Props {
  /** slot code -> "CODE · faculty" stamps for slots the active table occupies */
  usedSlots?: Record<string, string[]>;
  /** attach the PNG export target to the weekly grid column */
  exportRef?: React.RefObject<HTMLDivElement | null>;
  /** turn the picked slot stack into a custom course (opens the dialog prefilled) */
  onCreateCourse?: (slots: string[]) => void;
}

const GRID_COLORS = 10;

/** cell -> selected slot codes occupying it, plus conflict bookkeeping */
interface CellInfo {
  slots: { code: string; colorIdx: number }[];
}

export function SlotView({ usedSlots = {}, exportRef, onCreateCourse }: Props) {
  const theorySlots = useMemo(() => allTheorySlots(), []);
  const labSlots = useMemo(() => allLabSlots(), []);

  /* orientation preference — SHARED with the Timetable tab (persisted) */
  const orientation = useFFCS((s) => s.gridOrientation);
  const setGridOrientation = useFFCS((s) => s.setGridOrientation);
  const horizontal = orientation === "horizontal";

  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const loadMyTable = () => {
    const codes = [...new Set(Object.keys(usedSlots))];
    setPicked(codes);
  };

  const f = filter.trim().toLowerCase();

  /* ---------- meetings for each picked slot ---------- */
  const slotMeetings = useMemo(() => {
    const map = new Map<string, { day: Day; start: number; end: number; isLab: boolean }[]>();
    for (const code of picked) {
      const lab = L_SLOT_MAP[code];
      if (lab) {
        const { start } = labPeriodRange(lab.periodIdx);
        map.set(code, [{ day: lab.day, start, end: start + 50, isLab: true }]);
      } else {
        const meetings = (SLOT_MEETINGS.chennai[code] || []).map((m) => ({ ...m }));
        if (meetings.length > 0) map.set(code, meetings);
      }
    }
    return map;
  }, [picked]);

  /* ---------- cell occupancy grid ---------- */
  const grid = useMemo(() => {
    const cells: CellInfo[][] = DAYS.map(() =>
      Array.from({ length: TOTAL_ROWS }, () => ({ slots: [] }))
    );
    const extraRow: { code: string; colorIdx: number }[] = [];
    picked.forEach((code, i) => {
      const ms = slotMeetings.get(code) || [];
      const colorIdx = i % GRID_COLORS;
      for (const m of ms) {
        const dayIdx = DAYS.indexOf(m.day);
        if (dayIdx < 0) continue;
        if (m.isLab) {
          const lab = L_SLOT_MAP[code];
          if (lab) cells[dayIdx][lab.periodIdx].slots.push({ code, colorIdx });
          continue;
        }
        let placed = false;
        for (let p = 0; p < TOTAL_ROWS; p++) {
          const { start, end } = labPeriodRange(p);
          if (m.start < end && m.end > start) {
            cells[dayIdx][p].slots.push({ code, colorIdx });
            placed = true;
          }
        }
        if (!placed && m.start >= 1140) extraRow.push({ code, colorIdx });
      }
    });
    return { cells, extraRow };
  }, [picked, slotMeetings]);

  /* ---------- conflict stats ---------- */
  const conflicts = useMemo(() => {
    const cells: { day: Day; periodIdx: number; pair: [string, string] }[] = [];
    const pairKeys = new Set<string>();
    DAYS.forEach((day, di) => {
      for (let p = 0; p < TOTAL_ROWS; p++) {
        const slots = grid.cells[di][p].slots;
        if (slots.length < 2) continue;
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            const key = [slots[i].code, slots[j].code].sort().join("+");
            if (pairKeys.has(key)) continue;
            pairKeys.add(key);
            cells.push({ day, periodIdx: p, pair: [slots[i].code, slots[j].code] });
          }
        }
      }
    });
    return cells;
  }, [grid]);

  const clashFree = picked.length > 1 && conflicts.length === 0;

  /** one grid cell (no key — caller supplies it, key differs per orientation) */
  const renderCellTd = (day: Day, periodIdx: number, key: string | number) => {
    const di = DAYS.indexOf(day);
    const info = grid.cells[di][periodIdx];
    const isConflict = info.slots.length >= 2;
    return (
      <td
        key={key}
        className={`tt-cell${isConflict ? " slotview-conflict" : ""}`}
        title={
          info.slots.length > 0
            ? info.slots.map((s) => s.code).join(" ⚡ ") + (isConflict ? " — CONFLICT!" : "")
            : undefined
        }
      >
        {info.slots.length === 0 ? (
          <div style={{ height: 30 }} aria-hidden />
        ) : (
          <div
            className="flex flex-wrap gap-0.5 items-center justify-center"
            style={{ minHeight: 30 }}
          >
            {info.slots.map((s, i) => (
              <span
                key={`${s.code}-${i}`}
                className={`tt-block tt-${s.colorIdx}`}
                style={{
                  display: "inline-block",
                  fontSize: "0.68rem",
                  padding: "1px 5px",
                  minHeight: 0,
                  height: "auto",
                }}
              >
                {s.code}
              </span>
            ))}
          </div>
        )}
      </td>
    );
  };

  /** segmented vertical/horizontal control — same store field as the Timetable tab */
  const orientationToggle = (
    <div
      role="group"
      aria-label="Slot view layout direction (synced with the Timetable tab)"
      className="flex"
      style={{
        border: "2px solid var(--ffcs-ink)",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        overflow: "hidden",
        background: "var(--card)",
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => setGridOrientation("vertical")}
        aria-pressed={!horizontal}
        title="Classic layout — days across the top, time down the side (synced with the Timetable tab)"
        className="ori-btn"
        style={!horizontal ? { background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700 } : undefined}
      >
        ⬍ vertical
      </button>
      <button
        onClick={() => setGridOrientation("horizontal")}
        aria-pressed={horizontal}
        title="Rotated layout — days down the side, time across the top (synced with the Timetable tab)"
        className="ori-btn"
        style={horizontal ? { background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700 } : undefined}
      >
        ⬌ horizontal
      </button>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
      {/* ------------ left: slot chips ------------ */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h2 className="text-lg font-bold" style={{ margin: 0 }}>
            Stack <span className="sketch-underline">slots</span>
          </h2>
          <div className="flex gap-1" style={{ flexShrink: 0 }}>
            <button
              className="prio-btn wide"
              onClick={loadMyTable}
              title="Import the slots your current table already occupies"
              style={{ fontSize: "0.76rem", whiteSpace: "nowrap" }}
            >
              <Table2 size={13} /> <span>load my table</span>
            </button>
            <button
              className="prio-btn wide"
              onClick={() => setPicked([])}
              disabled={picked.length === 0}
              title="Clear all picked slots"
              aria-label="Clear all picked slots"
              style={{ fontSize: "0.76rem", whiteSpace: "nowrap", opacity: picked.length === 0 ? 0.4 : 1 }}
            >
              <Eraser size={13} /> <span>clear</span>
            </button>
          </div>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-ink)", margin: "0 0 8px" }}>
          Tap slot codes to pencil them onto the weekly grid — instantly see whether the
          combination is clash-free. ✏ stamps = slots your table already uses.
        </p>

        <div className="relative mb-2">
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, opacity: 0.5 }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter slots… e.g. A1, TB, L2"
            aria-label="Filter slot codes"
            style={{
              width: "100%",
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              padding: "7px 10px 7px 30px",
              fontFamily: "inherit",
              background: "var(--input)",
              fontSize: "0.85rem",
            }}
          />
        </div>

        <div className="ffcs-scroll" style={{ maxHeight: 460, overflowY: "auto", paddingRight: 2 }}>
          <div className="ffcs-label">Theory slots ({theorySlots.length})</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {theorySlots
              .filter((c) => !f || c.toLowerCase().includes(f))
              .map((c) => {
                const idx = picked.indexOf(c);
                const selected = idx >= 0;
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    aria-pressed={selected}
                    title={usedSlots[c] ? `Used by: ${usedSlots[c].join(", ")}` : `Toggle ${c}`}
                    className={`chip clickable${selected ? ` tt-${idx % GRID_COLORS}` : ""}`}
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 8px",
                      background: selected ? `var(--tt${idx % GRID_COLORS})` : "var(--input)",
                      textDecoration: !selected && usedSlots[c] ? "underline dotted" : undefined,
                    }}
                  >
                    {!selected && usedSlots[c] ? "✏ " : ""}
                    {c}
                  </button>
                );
              })}
          </div>
          <div className="ffcs-label">Lab periods ({labSlots.length})</div>
          <div className="flex flex-wrap gap-1">
            {labSlots
              .filter((c) => !f || c.toLowerCase().includes(f))
              .map((c) => {
                const idx = picked.indexOf(c);
                const selected = idx >= 0;
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    aria-pressed={selected}
                    title={usedSlots[c] ? `Used by: ${usedSlots[c].join(", ")}` : `Toggle ${c}`}
                    className={`chip clickable${selected ? ` tt-${idx % GRID_COLORS}` : ""}`}
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 8px",
                      background: selected ? `var(--tt${idx % GRID_COLORS})` : "var(--input)",
                      textDecoration: !selected && usedSlots[c] ? "underline dotted" : undefined,
                    }}
                  >
                    {!selected && usedSlots[c] ? "✏ " : ""}
                    {c}
                  </button>
                );
              })}
          </div>
        </div>

        {/* status card */}
        <div
          className="p-2 mt-2"
          style={{
            border: `2.5px dashed ${clashFree ? "var(--good-strong)" : conflicts.length > 0 ? "var(--danger)" : "var(--cell-border)"}`,
            borderRadius: "10px 5px 12px 6px",
            background: clashFree ? "var(--good-soft)" : "var(--flex-bg)",
            fontSize: "0.8rem",
          }}
        >
          {picked.length === 0 ? (
            <>Pick some slots to test a combination ✏️</>
          ) : clashFree ? (
            <strong style={{ color: "var(--good-strong)" }}>
              ✓ {picked.length} slots, zero overlaps — clash-free combo!
            </strong>
          ) : conflicts.length > 0 ? (
            <>
              <strong style={{ color: "var(--danger)" }}>
                ⚠ {conflicts.length} clashing pair{conflicts.length > 1 ? "s" : ""}:
              </strong>
              <div style={{ marginTop: 3 }}>
                {conflicts.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ fontSize: "0.74rem" }}>
                    {c.pair[0]} ⚡ {c.pair[1]} — {DAY_LABELS[c.day].slice(0, 3)}{" "}
                    {fmtTimeShort(labPeriodRange(c.periodIdx).start)}
                  </div>
                ))}
                {conflicts.length > 6 && <div style={{ fontSize: "0.74rem" }}>…and {conflicts.length - 6} more</div>}
              </div>
            </>
          ) : (
            <>1 slot picked — add another to test overlaps.</>
          )}
          {picked.length > 0 && onCreateCourse && (
            <button
              type="button"
              onClick={() => onCreateCourse(picked)}
              title="Create a custom course that sits exactly on these slots"
              className="chip clickable"
              style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: "0.76rem",
                background: "var(--accent)",
                color: "var(--on-accent)",
                boxShadow: "1.5px 2px 0 var(--shadow-strong)",
              }}
            >
              <Pencil size={12} aria-hidden /> save this stack as a custom course
            </button>
          )}
        </div>
      </div>

      {/* ------------ right: weekly grid (outside exportRef: toolbar must not appear in PNG) ------------ */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <span className="ffcs-label">Slot grid</span>
          {orientationToggle}
        </div>
        <div ref={exportRef}>
          <div className="tt-wrap">
            {horizontal ? (
              /* HORIZONTAL: rows = days, cols = periods, lunch = narrow strip column */
              <table className="tt tt-horizontal">
                <thead>
                  <tr>
                    <th className="tt-time tt-day-col" style={{ fontSize: "0.8rem" }}>
                      Day
                    </th>
                    {Array.from({ length: TOTAL_ROWS }, (_, p) => {
                      const { start, end } = labPeriodRange(p);
                      const th = (
                        <th key={p} className="tt-time-h" title={`${fmtTime(start)} – ${fmtTime(end)}`}>
                          <div>{fmtTimeShort(start)}</div>
                          <div style={{ opacity: 0.7 }}>{fmtTimeShort(end)}</div>
                        </th>
                      );
                      return p === MORNING_ROWS
                        ? [
                            <th key="lunch" className="tt-lunch tt-lunch-h" title={`Lunch · ${LUNCH_LABEL}`}>
                              <span className="tt-lunch-label" aria-hidden>
                                LUNCH
                              </span>
                            </th>,
                            th,
                          ]
                        : [th];
                    })}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day}>
                      <th scope="row" className="tt-time tt-day-col">
                        {DAY_LABELS[day]}
                      </th>
                      {Array.from({ length: TOTAL_ROWS }, (_, p) =>
                        p === MORNING_ROWS ? (
                          [
                            <td key="lunch" className="tt-lunch tt-lunch-h" title={`Lunch · ${LUNCH_LABEL}`}>
                              <span aria-hidden>☀</span>
                            </td>,
                            renderCellTd(day, p, p),
                          ]
                        ) : (
                          renderCellTd(day, p, p)
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* VERTICAL: rows = periods, cols = days, lunch = full-width row */
              <table className="tt">
                <thead>
                  <tr>
                    <th className="tt-time" style={{ fontSize: "0.8rem" }}>Time</th>
                    {DAYS.map((d) => (
                      <th key={d}>{DAY_LABELS[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: MORNING_ROWS }, (_, p) => (
                    <tr key={`m${p}`}>
                      <td className="tt-time">
                        <div>{fmtTimeShort(labPeriodRange(p).start)}</div>
                        <div style={{ opacity: 0.7 }}>{fmtTimeShort(labPeriodRange(p).end)}</div>
                      </td>
                      {DAYS.map((d) => renderCellTd(d, p, d))}
                    </tr>
                  ))}
                  <tr>
                    <td className="tt-time" style={{ padding: 2 }}>Lunch</td>
                    <td className="tt-lunch" colSpan={5}>
                      ☀ LUNCH · {LUNCH_LABEL}
                    </td>
                  </tr>
                  {Array.from({ length: TOTAL_ROWS - MORNING_ROWS }, (_, i) => (
                    <tr key={`a${i}`}>
                      <td className="tt-time">
                        <div>{fmtTimeShort(labPeriodRange(MORNING_ROWS + i).start)}</div>
                        <div style={{ opacity: 0.7 }}>{fmtTimeShort(labPeriodRange(MORNING_ROWS + i).end)}</div>
                      </td>
                      {DAYS.map((d) => renderCellTd(d, MORNING_ROWS + i, d))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="ffcs-label">Legend:</span>
            <span className="chip" style={{ fontSize: "0.72rem" }}>
              colored chips = picked slots
            </span>
            <span className="chip" style={{ fontSize: "0.72rem", opacity: 0.7 }}>
              ✏ dotted = already used in your table
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
