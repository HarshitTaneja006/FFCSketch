"use client";

/**
 * TimetableGrid — weekly grid on the 12-lab-period × 5-day model,
 * theory slots overlay cells (like FFCSonTheGo), labs span multiple rows when
 * paired (L1+L2 renders as ONE long block).
 *
 * Two orientations (user preference, persisted in the store):
 *  - "vertical"   → classic layout: days across the top, time down the side
 *  - "horizontal" → rotated layout: days down the side, time across the top
 */

import { useMemo } from "react";
import {
  CartEntry,
  Campus,
  DAYS,
  DAY_LABELS,
  GridBlock,
  Day,
} from "@/lib/ffcs/types";
import { buildGridBlocks } from "@/lib/ffcs/timetable";
import {
  LAB_PERIOD_STARTS,
  LUNCH,
  LUNCH_LABEL,
  MORNING_ROWS,
  TOTAL_ROWS,
  fmtTime,
  fmtTimeShort,
  labPeriodRange,
  slotsAtCell,
} from "@/lib/ffcs/slots";
import { useFFCS } from "@/store/ffcs";

interface Props {
  entries: CartEntry[];
  campus: Campus;
  onBlockClick?: (block: GridBlock, anchor: { x: number; y: number }) => void;
  /** click on an empty cell → reverse slot lookup ("what fits here?") */
  onEmptyCellClick?: (day: Day, periodIdx: number, anchor: { x: number; y: number }) => void;
  /** pencil-in preview: sections rendered as dashed ghost blocks (non-interactive) */
  ghostEntries?: CartEntry[];
}

export default function TimetableGrid({ entries, campus, onBlockClick, onEmptyCellClick, ghostEntries }: Props) {
  const blocks = useMemo(() => buildGridBlocks(entries, campus), [entries, campus]);
  const ghostBlocks = useMemo(
    () =>
      (ghostEntries || []).map((g) =>
        buildGridBlocks([g], campus).map((b) => ({ ...b, isGhost: true }))
      ).flat(),
    [ghostEntries, campus]
  );
  const allBlocks = useMemo(() => [...blocks, ...ghostBlocks], [blocks, ghostBlocks]);
  const courseColors = useFFCS((s) => s.courseColors);
  const orientation = useFFCS((s) => s.gridOrientation);

  /** effective palette index for a block (manual override wins over hash) */
  const colorFor = (b: GridBlock) => courseColors[`${b.code}|${b.type}`] ?? b.colorIdx;

  // map: day -> rowStart -> blocks[]  (ghost peek blocks included)
  const byDayRow = useMemo(() => {
    const map = new Map<Day, Map<number, GridBlock[]>>();
    for (const d of DAYS) map.set(d, new Map());
    for (const b of allBlocks) {
      const rowMap = map.get(b.day)!;
      const arr = rowMap.get(b.rowStart) || [];
      arr.push(b);
      rowMap.set(b.rowStart, arr);
    }
    return map;
  }, [allBlocks]);

  const flexBlocks = useMemo(() => blocks.filter((b) => b.isFlex), [blocks]);

  /** slot codes that live in each empty cell ("A1" / "L3" / "A1 · L3") —
   *  shown as faint pencil hints so students can see which slots are free */
  const slotHintAt = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of DAYS) {
      for (let p = 0; p < TOTAL_ROWS; p++) {
        const codes = slotsAtCell(day, p, campus);
        if (codes.length === 0) continue;
        const theory = codes.filter((c) => c.kind === "theory").map((c) => c.slot);
        const labs = codes.filter((c) => c.kind === "lab").map((c) => c.slot);
        const label = [...theory, ...labs].join(" · ");
        if (label) map.set(`${day}|${p}`, label);
      }
    }
    return map;
  }, [campus]);

  const hintFor = (day: Day, p: number) => slotHintAt.get(`${day}|${p}`);

  /** block hover title — now includes the venue when known */
  const blockTitle = (b: GridBlock, isGhost: boolean) => {
    const lines = [
      isGhost ? `👻 peek: ${b.code} — ${b.title}` : `${b.code} — ${b.title}`,
      `${b.faculty} | ${b.slotLabel}`,
    ];
    if (b.venue) lines.push(`📍 ${b.venue}`);
    if (!isGhost) lines.push("Click for options");
    else lines.push("Apply the combo in the Generator to keep it");
    return lines.join("\n");
  };

  /* ---------------- shared block renderer ---------------- */
  const renderBlock = (b: GridBlock, i: number) =>
    b.isGhost ? (
      <div
        key={b.uid + b.slotLabel + i}
        className={`tt-block tt-${colorFor(b)} ghost`}
        style={{ flex: 1, minWidth: 0, height: "auto" }}
        title={blockTitle(b, true)}
        aria-label={`Ghost preview: ${b.code} ${b.slotLabel}`}
      >
        <div className="ttb-code">
          {b.code}{" "}
          <span style={{ fontWeight: 400, opacity: 0.75 }}>· {b.slotLabel}</span>
        </div>
        <div className="ttb-fac">{b.faculty}</div>
      </div>
    ) : (
      <div
        key={b.uid + b.slotLabel + i}
        className={`tt-block tt-${colorFor(b)}${b.isClash ? " is-clash" : ""}`}
        style={{ flex: 1, minWidth: 0, height: "auto" }}
        title={blockTitle(b, false)}
        onClick={(e) => onBlockClick?.(b, { x: e.clientX, y: e.clientY })}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onBlockClick?.(b, { x: rect.left + rect.width / 2, y: rect.bottom });
          }
        }}
      >
        <div className="ttb-code">
          {b.code}{" "}
          <span style={{ fontWeight: 400, opacity: 0.75 }}>· {b.slotLabel}</span>
        </div>
        <div className="ttb-fac">{b.faculty}</div>
      </div>
    );

  /** blocks starting at (day, p), whether the cell is covered by a span, max span */
  const cellAt = (day: Day, p: number) => {
    const starting = byDayRow.get(day)!.get(p) || [];
    const covered = allBlocks.some(
      (b) =>
        b.day === day &&
        !b.isFlex &&
        b.rowStart < p &&
        b.rowStart + b.rowSpan > p
    );
    const maxSpan = Math.max(1, ...starting.map((b) => b.rowSpan));
    const real = starting.some((b) => !b.isGhost);
    return { starting, covered, maxSpan, isEmpty: starting.length === 0, hasReal: real };
  };

  /* ---------------- VERTICAL: rows = periods, cols = days ---------------- */
  const renderRowVertical = (periodIdx: number) => {
    const { start, end } = labPeriodRange(periodIdx);
    return (
      <tr key={`p${periodIdx}`}>
        <td className="tt-time">
          <div>{fmtTimeShort(start)}</div>
          <div style={{ opacity: 0.7 }}>{fmtTimeShort(end)}</div>
        </td>
        {DAYS.map((day) => {
          const { starting, covered, maxSpan, isEmpty } = cellAt(day, periodIdx);
          if (covered) return null;
          return (
            <td
              key={day}
              className={`tt-cell${isEmpty && onEmptyCellClick ? " tt-empty" : ""}`}
              rowSpan={maxSpan > 1 ? maxSpan : undefined}
              onClick={
                isEmpty && onEmptyCellClick
                  ? (e) => onEmptyCellClick(day, periodIdx, { x: e.clientX, y: e.clientY })
                  : undefined
              }
              title={isEmpty && onEmptyCellClick ? `Free · ${hintFor(day, periodIdx) || "no slots"} — click to find courses` : undefined}
            >
              {isEmpty ? (
                <div className="tt-empty-slot" aria-hidden>
                  {hintFor(day, periodIdx) || ""}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "stretch" }}>
                  {starting.map(renderBlock)}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  /* ---------------- HORIZONTAL: rows = days, cols = periods ---------------- */
  const renderRowHorizontal = (day: Day) => {
    return (
      <tr key={day}>
        <th scope="row" className="tt-time tt-day-col">
          {DAY_LABELS[day]}
        </th>
        {Array.from({ length: TOTAL_ROWS }, (_, p) => {
          const { starting, covered, maxSpan, isEmpty } = cellAt(day, p);
          if (covered) return null;
          const cells = [
            // lunch column sits between the morning and afternoon periods
            ...(p === MORNING_ROWS
              ? [
                  <td key="lunch" className="tt-lunch tt-lunch-h" title={`Lunch · ${LUNCH_LABEL}`}>
                    <span aria-hidden>☀</span>
                  </td>,
                ]
              : []),
            <td
              key={p}
              className={`tt-cell${isEmpty && onEmptyCellClick ? " tt-empty" : ""}`}
              colSpan={maxSpan > 1 ? maxSpan : undefined}
              onClick={
                isEmpty && onEmptyCellClick
                  ? (e) => onEmptyCellClick(day, p, { x: e.clientX, y: e.clientY })
                  : undefined
              }
              title={isEmpty && onEmptyCellClick ? `Free · ${hintFor(day, p) || "no slots"} — click to find courses` : undefined}
            >
              {isEmpty ? (
                <div className="tt-empty-slot" aria-hidden>
                  {hintFor(day, p) || ""}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "stretch" }}>
                  {starting.map(renderBlock)}
                </div>
              )}
            </td>,
          ];
          return cells;
        })}
      </tr>
    );
  };

  const horizontal = orientation === "horizontal";

  return (
    <div>
      <div className="tt-wrap">
        {horizontal ? (
          <table className="tt tt-horizontal">
            <thead>
              <tr>
                <th className="tt-time tt-day-col" style={{ fontSize: "0.8rem" }}>
                  Day
                </th>
                {Array.from({ length: TOTAL_ROWS }, (_, p) => {
                  const { start, end } = labPeriodRange(p);
                  const th = (
                    <th key={p} className="tt-time-h" title={`${fmtTime(start)} - ${fmtTime(end)}`}>
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
            <tbody>{DAYS.map(renderRowHorizontal)}</tbody>
          </table>
        ) : (
          <table className="tt">
            <thead>
              <tr>
                <th className="tt-time" style={{ fontSize: "0.8rem" }}>
                  Time
                </th>
                {DAYS.map((d) => (
                  <th key={d}>{DAY_LABELS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MORNING_ROWS }, (_, p) => renderRowVertical(p))}
              <tr>
                <td className="tt-time" style={{ padding: 2 }}>Lunch</td>
                <td className="tt-lunch" colSpan={5}>
                  ☀ LUNCH · {LUNCH_LABEL}
                </td>
              </tr>
              {Array.from({ length: 6 }, (_, i) => renderRowVertical(MORNING_ROWS + i))}
              <tr>
                <td className="tt-time">
                  <div>{fmtTimeShort(1140)}</div>
                  <div style={{ opacity: 0.7 }}>{fmtTimeShort(1190)}</div>
                </td>
                <td className="tt-lunch" colSpan={5} style={{ padding: 4 }}>
                  {(() => {
                    const extra = allBlocks.filter((b) => !b.isFlex && b.rowStart === 12);
                    if (extra.length === 0)
                      return <span style={{ opacity: 0.55 }}>Evening slot row (S1-S4)</span>;
                    return (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {extra.map((b, i) =>
                          b.isGhost ? (
                            <span
                              key={`g${i}`}
                              className={`tt-block tt-${colorFor(b)} ghost`}
                              style={{ display: "inline-block", height: "auto", minHeight: 30, minWidth: 130 }}
                              title={`👻 peek: ${b.code} · ${b.slotLabel} — ${b.faculty}${b.venue ? ` · 📍 ${b.venue}` : ""}`}
                            >
                              <span className="ttb-code">
                                {b.code} · {b.slotLabel}
                              </span>
                              <span className="ttb-fac"> {b.faculty}</span>
                            </span>
                          ) : (
                            <span
                              key={i}
                              className={`tt-block tt-${colorFor(b)}${b.isClash ? " is-clash" : ""}`}
                              style={{ display: "inline-block", height: "auto", minHeight: 30, minWidth: 130 }}
                              onClick={(e) => onBlockClick?.(b, { x: e.clientX, y: e.clientY })}
                            >
                              <span className="ttb-code">
                                {b.code} · {b.slotLabel}
                              </span>
                              <span className="ttb-fac"> {b.faculty}</span>
                            </span>
                          )
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {flexBlocks.length > 0 && (
        <div className="mt-3" style={{ border: "2px dashed var(--label-ink)", borderRadius: "10px 5px 12px 6px", padding: "8px 12px", background: "var(--flex-bg)" }}>
          <div className="ffcs-label">Flexible / unscheduled sections (timings not published)</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {Array.from(new Set(flexBlocks.map((b) => b.uid))).map((uid) => {
              const b = flexBlocks.find((x) => x.uid === uid)!;
              return (
                <span key={uid} className="chip" title={b.faculty}>
                  {b.code} · {b.slotLabel} · {b.faculty}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap items-center gap-2 mt-2 no-print">
        <span className="ffcs-label">Legend:</span>
        <span className="chip" style={{ background: "var(--tt0)" }}>Theory/Lab block</span>
        <span
          className="chip"
          style={{
            background:
              "repeating-linear-gradient(-45deg, rgba(192,57,43,0.16), rgba(192,57,43,0.16) 5px, var(--card) 5px, var(--card) 11px)",
            borderColor: "var(--danger)",
            borderStyle: "dashed",
          }}
        >
          Clash!
        </span>
        <span className="chip">Click a free cell to search that time</span>
        {ghostEntries && ghostEntries.length > 0 && (
          <span
            className="chip ghost-legend-chip"
            title="Dashed blocks are a pencil-in preview from the Generator — nothing is saved until you apply it"
          >
            👻 ghost peek on
          </span>
        )}
        <span className="chip" style={{ opacity: 0.7 }}>
          Grid shows {fmtTime(LAB_PERIOD_STARTS[0])} - 7:20 PM · lunch {fmtTime(LUNCH.start)}-
          {fmtTime(LUNCH.end).replace(":00", "")}
        </span>
      </div>
    </div>
  );
}
