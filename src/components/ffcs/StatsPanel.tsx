"use client";

/**
 * StatsPanel — the essential numbers for FFCS decision-making:
 * credits, clashes, contact hours, free days, daily spread, gaps.
 * (Kept deliberately lean — no heatmaps or gimmick charts.)
 */

import { useMemo } from "react";
import { useFFCS } from "@/store/ffcs";
import { computeStats, rangeLabel } from "@/lib/ffcs/timetable";
import { DAYS, DAY_LABELS } from "@/lib/ffcs/types";

export default function StatsPanel() {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const campus = useFFCS((s) => s.campus);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];
  const entries = activeTable?.entries || [];

  const stats = useMemo(() => computeStats(entries, campus), [entries, campus]);

  return (
    <div>
      <h3 className="ffcs-label" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
        Table insights
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="stat-card">
          <div className="stat-value">{stats.totalCredits % 1 === 0 ? stats.totalCredits : stats.totalCredits.toFixed(1)}</div>
          <div className="stat-label">Total credits</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: stats.clashCount > 0 ? "var(--danger)" : "var(--good-strong)" }}>
            {stats.clashCount}
          </div>
          <div className="stat-label">Clashes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.contactHours}</div>
          <div className="stat-label">Contact hrs/week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.freeDays.length}</div>
          <div className="stat-label">Free days</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: "1rem", paddingTop: 4 }}>
            {rangeLabel(stats.earliestStart, stats.latestEnd)}
          </div>
          <div className="stat-label">Earliest → latest</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.gapCount}</div>
          <div className="stat-label">Gaps between classes</div>
        </div>
      </div>

      {stats.freeDays.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {stats.freeDays.map((d) => (
            <span
              key={d}
              className="chip"
              style={{ background: "var(--good)", fontSize: "0.72rem" }}
              title={`${DAY_LABELS[d]} has no classes — plan an extra course here if you need more credits`}
            >
              🎉 {DAY_LABELS[d]} free
            </span>
          ))}
        </div>
      )}

      {stats.freeDays.length > 0 && entries.length > 0 && (
        <div style={{ fontSize: "0.72rem", color: "var(--muted-ink)", marginTop: 6 }}>
          Tip: use the timetable's free cells (they show their slot codes) to fit one more course.
        </div>
      )}
    </div>
  );
}
