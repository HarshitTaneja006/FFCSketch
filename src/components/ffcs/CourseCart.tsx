"use client";

/**
 * CourseCart — list of sections in the active table with clash info,
 * embedded-pair suggestions, and remove buttons.
 *
 * Rendered as compact cards (NOT a table): the remove + color buttons are
 * always visible on every screen size — no horizontal scrolling required.
 */

import { useMemo, useState } from "react";
import { ArrowRight, FileDown, Link2, MapPin, Trash2 } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import { clashWithEntries, findClashes } from "@/lib/ffcs/timetable";
import { embeddedPairProblems, pairProblemUids, PairProblem } from "@/lib/ffcs/embedded";
import { CartEntry, COURSE_TYPE_LABELS } from "@/lib/ffcs/types";
import { toast } from "@/hooks/use-toast";
import { SwatchPopover } from "./ColorPicker";

/** short type badges so the header row never wraps awkwardly */
const SHORT_TYPE: Record<string, string> = {
  TH: "TH",
  ETH: "ET",
  ELA: "EL",
  LO: "LAB",
  SS: "SS",
  EPJ: "EPJ",
  PJT: "PJT",
  OC: "OC",
};

const CARD: React.CSSProperties = {
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "10px 5px 12px 6px / 6px 12px 5px 10px",
  background: "var(--card)",
  boxShadow: "2px 2.5px 0 var(--shadow-ink)",
  padding: "12px 14px",
  transition: "transform 0.1s ease, filter 0.12s ease",
};

export default function CourseCart({ onGoToCourses }: { onGoToCourses: () => void }) {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const campus = useFFCS((s) => s.campus);
  const removeEntry = useFFCS((s) => s.removeEntry);
  const courseColors = useFFCS((s) => s.courseColors);
  const setCourseColor = useFFCS((s) => s.setCourseColor);

  const [swatchFor, setSwatchFor] = useState<CartEntry | null>(null);
  const [swatchAnchor, setSwatchAnchor] = useState<{ x: number; y: number } | null>(null);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];
  const entries = activeTable?.entries || [];

  const clashes = useMemo(() => findClashes(entries, campus), [entries, campus]);

  const clashMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of clashes) {
      map.set(c.aUid, [...(map.get(c.aUid) || []), c.bUid]);
      map.set(c.bUid, [...(map.get(c.bUid) || []), c.aUid]);
    }
    return map;
  }, [clashes]);

  /** embedded-pair violations: a half without its partner, or the two halves
   *  with DIFFERENT faculties (VIT registers embedded pairs, same faculty) */
  const pairProblems = useMemo(() => embeddedPairProblems(entries), [entries]);
  const pairWarnUids = useMemo(() => pairProblemUids(pairProblems), [pairProblems]);

  /** one-click fix: add the missing half / swap the mismatched half (prefers clash-free) */
  const fixPairProblem = (p: PairProblem) => {
    if (p.fixes.length === 0) return;
    const pick =
      p.fixes.find((x) => clashWithEntries(x, entries, campus).length === 0) || p.fixes[0];
    if (p.fixReplaceUid) {
      const res = useFFCS.getState().swapSection(p.fixReplaceUid, pick);
      if (res.ok) {
        toast({
          title: `Fixed ${p.code} pair ✓`,
          description: `${pick.type} ${pick.slot} · ${pick.faculty} — now the same faculty as the other half`,
        });
      } else {
        toast({ title: res.reason || "Could not fix automatically", variant: "destructive" });
      }
    } else {
      const res = useFFCS.getState().addSection(pick);
      if (res.ok) {
        toast({
          title: `Added the missing half ✓`,
          description: `${pick.type} ${pick.slot} · ${pick.faculty} completes the ${p.code} pair`,
        });
      } else {
        toast({ title: res.reason || "Could not add", variant: "destructive" });
      }
    }
  };

  const downloadCsv = () => {
    const header = "course_code,course_title,type,credits,venue,faculty,slot";
    const rows = entries.map((e) =>
      [e.code, e.title, e.type, e.credits, e.venue || "", e.faculty, e.slot]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FFCS ${activeTable?.name || "courses"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Course list downloaded 📋", description: "Handy during registration!" });
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="ffcs-label" style={{ fontSize: "0.85rem" }}>
          Course list ({entries.length}) — {activeTable?.name}
        </h3>
        {entries.length > 0 && (
          <button
            className="chip clickable"
            style={{ fontSize: "0.72rem" }}
            onClick={downloadCsv}
            title="Download course list as CSV (register faster)"
          >
            <FileDown size={12} className="inline mr-1" /> CSV
          </button>
        )}
      </div>

      {clashes.length > 0 && (
        <div className="clash-note mb-4" role="alert">
          <strong>⚠ {clashes.length} clash{clashes.length > 1 ? "es" : ""} detected!</strong>{" "}
          {clashes.slice(0, 3).map((c, i) => {
            const a = entries.find((e) => e.uid === c.aUid);
            const b = entries.find((e) => e.uid === c.bUid);
            return (
              <div key={i} style={{ fontSize: "0.82rem" }}>
                • {a?.code} ↔ {b?.code}
                {c.meetings.length > 0 && (
                  <span style={{ opacity: 0.8 }}>
                    {" "}({c.meetings
                      .slice(0, 2)
                      .map((m) => `${m.day} ${Math.floor(m.start / 60)}:${String(m.start % 60).padStart(2, "0")}`)
                      .join(", ")}
                    {c.meetings.length > 2 ? "…" : ""})
                  </span>
                )}
              </div>
            );
          })}
          {clashes.length > 3 && (
            <div style={{ fontSize: "0.82rem" }}>• …and {clashes.length - 3} more</div>
          )}
        </div>
      )}

      {pairProblems.length > 0 && (
        <div
          className="mb-4"
          role="alert"
          style={{
            border: "2px dashed var(--danger)",
            borderRadius: "10px 5px 12px 6px",
            background: "var(--bad-soft)",
            padding: "0.8rem 1rem",
            color: "var(--danger)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: "bold" }}>
            <Link2 size={14} className="inline mr-1" /> Embedded pairs — same faculty required:
          </div>
          {pairProblems.map((p) => (
            <div key={p.code} className="flex items-center gap-2 flex-wrap" style={{ fontSize: "0.84rem" }}>
              {p.kind === "missing" ? (
                <span>
                  <strong>{p.code}</strong> {p.lone?.type === "ETH" ? "theory" : "lab"} ({p.needFaculty}) needs
                  its {p.needType === "ELA" ? "lab" : "theory"} —
                </span>
              ) : (
                <span>
                  <strong>{p.code}</strong> faculty mismatch: theory {p.theory?.faculty} ↔ lab {p.lab?.faculty} —
                </span>
              )}
              {p.fixes.length > 0 ? (
                <button
                  className="chip clickable"
                  style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                  onClick={() => fixPairProblem(p)}
                  title={
                    p.fixReplaceUid
                      ? `Swap the ${p.needType === "ELA" ? "lab" : "theory"} to a section by ${p.needFaculty}`
                      : `Add ${p.needType} ${p.fixes[0].slot} by ${p.needFaculty}`
                  }
                >
                  {p.fixReplaceUid ? "⇄ switch" : "➕ add"} {p.needType === "ELA" ? "lab" : "theory"} {p.fixes[0].slot}
                </button>
              ) : (
                <>
                  <span style={{ opacity: 0.85 }}>
                    no matching {p.needType === "ELA" ? "ELA" : "ETH"} by {p.needFaculty} in the course list —
                  </span>
                  <button className="chip clickable" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={onGoToCourses}>
                    open picker <ArrowRight size={11} className="inline" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div
          className="text-center py-6"
          style={{
            border: "2px dashed var(--label-ink)",
            borderRadius: "12px 6px 14px 8px",
            color: "var(--label-ink)",
          }}
        >
          <span className="empty-doodle" aria-hidden>
            📝
          </span>
          <p>No courses yet — add some with the course picker above!</p>
        </div>
      ) : (
        <div className="ffcs-scroll grid gap-3" style={{ maxHeight: 420, overflowY: "auto", paddingRight: 2, alignContent: "start" }}>
          {entries.map((e) => {
            const clashingWith = clashMap.get(e.uid);
            const manualColor = courseColors[`${e.code}|${e.type}`];
            return (
              <div
                key={e.uid}
                className="cart-card"
                style={{
                  ...CARD,
                  ...(clashingWith
                    ? { background: "var(--bad)", border: "2px dashed var(--danger)" }
                    : {}),
                }}
                title={clashingWith ? `Clashes with ${clashingWith.length} course(s)` : undefined}
              >
                {/* row 1: code + badges + actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <strong style={{ fontSize: "0.88rem" }}>{e.code}</strong>
                  <span
                    className="chip"
                    style={{ fontSize: "0.62rem", padding: "1px 7px", background: "var(--accent)", color: "var(--on-accent)" }}
                    title={COURSE_TYPE_LABELS[e.type as keyof typeof COURSE_TYPE_LABELS] || e.type}
                  >
                    {SHORT_TYPE[e.type] || e.type}
                  </span>
                  <span className="chip" style={{ fontSize: "0.62rem", padding: "1px 7px" }} title={`Slot ${e.slot}`}>
                    🕒 {e.slot}
                  </span>
                  <span className="chip" style={{ fontSize: "0.62rem", padding: "1px 7px" }}>{e.credits} cr</span>
                  <span style={{ flex: 1 }} />
                  <button
                    className={`swatch${manualColor === undefined || manualColor === null ? " swatch-auto" : ""}`}
                    style={manualColor !== undefined && manualColor !== null ? { background: `var(--tt${manualColor})` } : undefined}
                    onClick={(ev) => {
                      setSwatchFor(e);
                      setSwatchAnchor({ x: ev.clientX, y: ev.clientY });
                    }}
                    aria-label={`Change timetable color for ${e.code}`}
                    title="Pick this course's timetable color"
                  />
                  <button
                    className="prio-btn"
                    onClick={() => {
                      removeEntry(e.uid);
                      toast({ title: `Removed ${e.code}` });
                    }}
                    aria-label={`Remove ${e.code}`}
                    title={`Remove ${e.code} from this table`}
                    style={{
                      width: 32,
                      height: 32,
                      minWidth: 32,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderColor: "var(--danger)",
                      color: "var(--danger)",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {/* row 2: title */}
                <div
                  style={{
                    fontSize: "0.78rem",
                    opacity: 0.85,
                    marginTop: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={e.title}
                >
                  {e.title}
                </div>
                {/* row 3: faculty + venue + clash/pair info */}
                <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: "0.72rem", color: "var(--muted-ink)", marginTop: 3 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }} title={e.faculty}>
                    👤 {e.faculty}
                  </span>
                  {e.venue && (
                    <span style={{ whiteSpace: "nowrap" }} title={`Venue: ${e.venue}`}>
                      <MapPin size={10} className="inline" style={{ verticalAlign: "-1px" }} /> {e.venue}
                    </span>
                  )}
                  {pairWarnUids.has(e.uid) && (
                    <span
                      style={{ color: "var(--danger)", fontWeight: 700, fontSize: "0.7rem", whiteSpace: "nowrap" }}
                      title="Embedded course: both halves must be present with the SAME faculty"
                    >
                      ⚠ pair incomplete/mismatch
                    </span>
                  )}
                  {clashingWith && (
                    <span style={{ color: "var(--danger)", fontWeight: 700, fontSize: "0.7rem" }}>
                      ⚠ clashes with {clashingWith.length} course{clashingWith.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SwatchPopover
        anchor={swatchAnchor}
        label={swatchFor ? swatchFor.code : ""}
        value={swatchFor ? (courseColors[`${swatchFor.code}|${swatchFor.type}`] ?? null) : null}
        onPick={(idx) => {
          if (swatchFor) setCourseColor(`${swatchFor.code}|${swatchFor.type}`, idx);
        }}
        onClose={() => setSwatchFor(null)}
      />
    </div>
  );
}
