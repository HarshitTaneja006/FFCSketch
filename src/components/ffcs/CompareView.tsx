"use client";

/**
 * CompareView — side-by-side comparison of two saved tables.
 * Stats chips + mini grids per table, A→B delta strip, course diff
 * (grouped by code|type) and a merged-plan clash check.
 * Reads everything from the Zustand store (no props).
 */

import { useCallback, useMemo, useState } from "react";
import { Download, Sparkles, Users, X } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import { computeStats, findClashes, rangeLabel, TableStats } from "@/lib/ffcs/timetable";
import { meetingLabel } from "@/lib/ffcs/slots";
import { decodeShareToken, extractShareToken } from "@/lib/ffcs/share";
import { CartEntry, Campus, DAY_LABELS, Timetable } from "@/lib/ffcs/types";
import TimetableGrid from "@/components/ffcs/TimetableGrid";
import { toast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* hand-drawn style building blocks                                    */
/* ------------------------------------------------------------------ */

const INK_SHADOW = "3px 4px 0 rgba(45,41,38,0.18)";

function cardStyle(radius = "12px 6px 14px 8px / 8px 14px 6px 12px"): React.CSSProperties {
  return {
    border: "2.5px solid var(--ffcs-ink)",
    borderRadius: radius,
    background: "var(--card)",
    boxShadow: INK_SHADOW,
    fontFamily: "inherit",
  };
}

const selectStyle: React.CSSProperties = {
  border: "2.5px solid var(--ffcs-ink)",
  borderRadius: "14px 8px 12px 6px / 6px 12px 8px 14px",
  background: "var(--input)",
  color: "var(--ffcs-ink)",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  padding: "8px 10px",
  minHeight: 44,
  boxShadow: "2px 3px 0 rgba(45,41,38,0.15)",
  cursor: "pointer",
  maxWidth: "100%",
};

function sticker(label: string, tint: string, tilt: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flex: "0 0 auto",
    fontWeight: "bold",
    fontSize: "0.95rem",
    border: "2px solid var(--ffcs-ink)",
    borderRadius: "55% 45% 40% 60% / 45% 60% 40% 55%",
    background: tint,
    color: "var(--ffcs-ink)",
    transform: `rotate(${tilt})`,
    boxShadow: "2px 2px 0 rgba(45,41,38,0.3)",
  };
}

const fmtNum = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
const arrowFor = (delta: number) => (delta > 0 ? "↑" : delta < 0 ? "↓" : "→");
const keyOf = (e: CartEntry) => `${e.code}|${e.type}`;

/** A timetable imported from a friend's share link (pseudo table, not in the store) */
interface ImportedTable extends Timetable {
  shareId: string;
  owner: string | null;
  shareCampus: Campus;
}

/**
 * Share links are now fully client-side (…/?s=<token>) — decode right here.
 * Legacy DB share ids (…/?shared=abc) are no longer resolvable without a backend.
 */
function extractShareTokenFromRaw(raw: string): string | null {
  return extractShareToken(raw);
}

/* ------------------------------------------------------------------ */
/* shared-link import strip                                            */
/* ------------------------------------------------------------------ */

interface ImportFrameProps {
  imported: ImportedTable | null;
  importVal: string;
  setImportVal: (v: string) => void;
  doImport: (raw: string) => void;
  clearImport: () => void;
  saveImported: () => void;
  sendToGenerator: () => void;
}

function ImportFrame({
  imported,
  importVal,
  setImportVal,
  doImport,
  clearImport,
  saveImported,
  sendToGenerator,
}: ImportFrameProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 p-2.5"
      style={{
        border: "2px dashed var(--label-ink)",
        borderRadius: "12px 7px 14px 8px / 8px 14px 7px 12px",
        background: "var(--flex-bg)",
        marginBottom: 12,
        animation: imported ? "import-pop 0.3s ease" : undefined,
      }}
      aria-label="Import a friend's shared timetable"
    >
      <span className="ffcs-label" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Users size={13} aria-hidden /> compare with a friend
      </span>
      {imported ? (
        <>
          <span
            className="chip"
            style={{ background: "var(--card)", whiteSpace: "normal", textAlign: "center" }}
            title={`Shared plan ${imported.shareId} · VIT Chennai`}
          >
            🤝 {imported.name} · {imported.entries.length} courses
          </span>
          <button
            type="button"
            className="chip clickable"
            onClick={sendToGenerator}
            style={{ background: "var(--card)", fontSize: "0.78rem" }}
            title="Merge your friend's courses into your Generator wishlist"
          >
            <Sparkles size={12} className="inline mr-1" aria-hidden />
            send to generator
          </button>
          <button
            type="button"
            className="chip clickable"
            onClick={saveImported}
            style={{ background: "var(--card)", fontSize: "0.78rem" }}
            title="Save this plan as one of your own tables"
          >
            <Download size={12} className="inline mr-1" aria-hidden />
            save to my tables
          </button>
          <button
            type="button"
            className="chip clickable"
            onClick={clearImport}
            style={{ background: "var(--card)", fontSize: "0.78rem" }}
            title="Remove this imported plan from the comparison"
          >
            <X size={12} className="inline mr-1" aria-hidden />
            remove
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doImport(importVal);
          }}
          className="flex flex-1 items-center gap-2"
          style={{ minWidth: 240 }}
        >
          <input
            type="text"
            value={importVal}
            onChange={(e) => setImportVal(e.target.value)}
            placeholder="paste their share link — e.g. …/?s=…"
            aria-label="Friend's share link"
            style={{
              flex: 1,
              minWidth: 0,
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "10px 5px 12px 6px / 6px 12px 5px 10px",
              background: "var(--input)",
              color: "var(--ffcs-ink)",
              fontFamily: "inherit",
              fontSize: "0.82rem",
              padding: "7px 10px",
            }}
          />
          <button
            type="submit"
            className="chip clickable"
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontFamily: "inherit",
              fontSize: "0.82rem",
              padding: "8px 14px",
              minHeight: 36,
            }}
          >
            <Download size={13} aria-hidden /> Import
          </button>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export default function CompareView() {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const campus = useFFCS((s) => s.campus);

  // selection state: null = "use the sensible default" (active / first other)
  const [aSel, setASel] = useState<string | null>(null);
  const [bSel, setBSel] = useState<string | null>(null);

  // shared-link import (Table B override)
  const [imported, setImported] = useState<ImportedTable | null>(null);
  const [importVal, setImportVal] = useState("");

  const doImport = useCallback(
    (raw: string) => {
      const token = extractShareTokenFromRaw(raw);
      if (!token) {
        toast({
          title: "That doesn't look like a share link",
          description: "Paste the full link (…/?s=…) — share links carry the plan inside the URL now.",
          variant: "destructive",
        });
        return;
      }
      const data = decodeShareToken(token);
      if (!data || data.entries.length === 0) {
        toast({
          title: "Could not read that share link",
          description: "The link may be incomplete, mistyped, or from an older version of this app.",
          variant: "destructive",
        });
        return;
      }
      const entries: CartEntry[] = data.entries.map((e, i) => ({
        ...e,
        uid: `imp-${token.slice(-6)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      const name = data.owner ? `${data.name} (by ${data.owner})` : data.name;
      setImported({
        id: `imported-${token.slice(-8)}`,
        shareId: token.slice(0, 10) + (token.length > 10 ? "…" : ""),
        name,
        owner: data.owner,
        shareCampus: "chennai",
        entries,
        createdAt: Date.now(),
      });
      setImportVal("");
      toast({
        title: "Friend's timetable imported! 🤝",
        description: `${name} — ${entries.length} courses loaded as Table B.`,
      });
    },
    []
  );

  /** save the imported friend's table as a real local table */
  const saveImported = () => {
    if (!imported) return;
    const st = useFFCS.getState();
    const prevActive = st.activeTableId;
    const id = st.addTable(imported.name); // addTable switches active — restore below
    st.replaceEntries(imported.entries, id);
    st.switchTable(prevActive || id); // keep the user's plan as the active/A table
    setImported(null);
    setASel(prevActive || null);
    setBSel(id);
    toast({
      title: "Saved to my tables! 💾",
      description: `“${imported.name}” is now a full table you can edit.`,
    });
  };

  /** merge the friend's course codes into your Generator wishlist (deduped) */
  const sendToGenerator = () => {
    if (!imported) return;
    const st = useFFCS.getState();
    const current = st.wishlist;
    const existing = new Set(current.map((w) => w.code.toUpperCase()));
    const fresh: { code: string; title: string }[] = [];
    for (const e of imported.entries) {
      const code = e.code.toUpperCase();
      if (existing.has(code) || fresh.some((f) => f.code === code)) continue;
      fresh.push({ code, title: e.title });
    }
    if (fresh.length === 0) {
      toast({ title: "All of your friend's courses are already in the wishlist ✨" });
      return;
    }
    st.setWishlist([
      ...current,
      ...fresh.map((f, i) => ({
        code: f.code,
        priority: current.length + i + 1,
        title: f.title,
      })),
    ]);
    toast({
      title: `Sent ${fresh.length} course${fresh.length > 1 ? "s" : ""} to the Generator ✨`,
      description: `${fresh.map((f) => f.code).join(", ")} — open the Generator tab to rank & build.`,
    });
  };

  const tableA = useMemo<Timetable | undefined>(
    () => tables.find((t) => t.id === aSel) || tables.find((t) => t.id === activeTableId) || tables[0],
    [tables, aSel, activeTableId]
  );

  const tableB = useMemo<Timetable | undefined>(() => {
    if (!tableA) return undefined;
    if (imported) return imported;
    return (
      (bSel && tables.find((t) => t.id === bSel)) ||
      tables.find((t) => t.id !== tableA.id) ||
      tableA
    );
  }, [tables, bSel, tableA, imported]);

  const statsA = useMemo<TableStats | null>(
    () => (tableA ? computeStats(tableA.entries, campus) : null),
    [tableA, campus]
  );
  const statsB = useMemo<TableStats | null>(
    () => (tableB ? computeStats(tableB.entries, campus) : null),
    [tableB, campus]
  );

  /* course diff grouped by code|type -------------------------------- */
  const diff = useMemo(() => {
    if (!tableA || !tableB) return null;
    const mapA = new Map<string, CartEntry>();
    tableA.entries.forEach((e) => mapA.set(keyOf(e), e));
    const mapB = new Map<string, CartEntry>();
    tableB.entries.forEach((e) => mapB.set(keyOf(e), e));

    const shared: CartEntry[] = [];
    const onlyA: CartEntry[] = [];
    const onlyB: CartEntry[] = [];
    for (const [k, e] of mapA) {
      if (mapB.has(k)) shared.push(e);
      else onlyA.push(e);
    }
    for (const [k, e] of mapB) if (!mapA.has(k)) onlyB.push(e);

    const byCode = (x: CartEntry, y: CartEntry) => x.code.localeCompare(y.code) || x.type.localeCompare(y.type);
    return {
      shared: [...shared].sort(byCode),
      onlyA: [...onlyA].sort(byCode),
      onlyB: [...onlyB].sort(byCode),
    };
  }, [tableA, tableB]);

  /* merged plan check ------------------------------------------------ */
  const merged = useMemo<CartEntry[]>(() => {
    if (!tableA || !tableB) return [];
    const map = new Map<string, CartEntry>();
    tableA.entries.forEach((e) => map.set(keyOf(e), e));
    tableB.entries.forEach((e) => {
      if (!map.has(keyOf(e))) map.set(keyOf(e), e); // conflict → keep A's version
    });
    return Array.from(map.values());
  }, [tableA, tableB]);

  const mergedClashes = useMemo(() => findClashes(merged, campus), [merged, campus]);

  const mergedByUid = useMemo(() => {
    const m = new Map<string, CartEntry>();
    merged.forEach((e) => m.set(e.uid, e));
    return m;
  }, [merged]);

  /* ------------------------------------------------------------------ */
  /* empty state: fewer than 2 tables (import still available)            */
  /* ------------------------------------------------------------------ */
  if (tables.length < 2 && !imported) {
    return (
      <section aria-label="Compare tables">
        <h3 className="ffcs-label" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
          Compare tables
        </h3>
        <div
          className="p-4 text-center"
          style={{ ...cardStyle(), maxWidth: 560, margin: "0 auto" }}
          role="status"
        >
          <span className="empty-doodle" aria-hidden="true">
            🗒️
          </span>
          <p style={{ margin: "6px 0 0", fontSize: "1rem" }}>
            Create at least two tables to compare them — use the{" "}
            <strong>Table ▼ menu in the header!</strong>
          </p>
          <p style={{ margin: "10px 0 4px", fontSize: "0.85rem", color: "var(--muted-ink)" }}>
            …or import a friend&apos;s shared plan and compare it with yours right here 👇
          </p>
          <ImportFrame
            imported={imported}
            importVal={importVal}
            setImportVal={setImportVal}
            doImport={doImport}
            clearImport={() => setImported(null)}
            saveImported={saveImported}
            sendToGenerator={sendToGenerator}
          />
        </div>
      </section>
    );
  }

  if (!tableA || !tableB || !statsA || !statsB || !diff) return null;

  const swap = () => {
    setASel(tableB.id);
    setBSel(tableA.id);
    toast({ title: "Swapped A ⇄ B", description: `Table A is now “${tableB.name}”` });
  };

  const deltas = [
    { label: "Credits", a: statsA.totalCredits, b: statsB.totalCredits },
    { label: "Contact hrs", a: statsA.contactHours, b: statsB.contactHours },
    { label: "Free days", a: statsA.freeDays.length, b: statsB.freeDays.length },
    { label: "Gaps", a: statsA.gapCount, b: statsB.gapCount },
  ];

  /* one table card ---------------------------------------------------- */
  const renderCard = (tt: Timetable, st: TableStats, which: "A" | "B") => (
    <div className="p-3 md:p-4" style={cardStyle(which === "A" ? "14px 8px 12px 6px / 6px 12px 8px 14px" : "8px 14px 6px 12px / 12px 6px 14px 8px")}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <span style={sticker(which, which === "A" ? "var(--accent)" : "var(--good)", which === "A" ? "-7deg" : "5deg")} aria-hidden="true">
          {which}
        </span>
        <h4 style={{ margin: 0, fontSize: "1.05rem", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          {tt.name}
          {tt.id === activeTableId && (
            <span style={{ fontSize: "0.7rem", color: "var(--muted-ink)" }}> (active)</span>
          )}
        </h4>
        <span style={{ fontSize: "0.75rem", color: "var(--muted-ink)" }}>
          {rangeLabel(st.earliestStart, st.latestEnd)}
        </span>
      </div>

      {/* imported plan meta strip */}
      {imported && tt.id === imported.id && (
        <div
          className="flex flex-wrap items-center gap-2"
          style={{
            border: "2px dashed var(--good-strong)",
            borderRadius: "10px 6px 12px 8px / 8px 12px 6px 10px",
            background: "var(--good-soft)",
            padding: "6px 10px",
            fontSize: "0.78rem",
            marginBottom: 8,
          }}
        >
          <span>
            🤝 shared plan — penciled in as Table B
          </span>
          <button
            type="button"
            className="chip clickable"
            onClick={sendToGenerator}
            style={{ background: "var(--card)", fontSize: "0.75rem" }}
            title="Merge your friend's courses into your Generator wishlist"
          >
            <Sparkles size={12} className="inline mr-1" aria-hidden />
            send to generator
          </button>
          <button
            type="button"
            className="chip clickable"
            onClick={saveImported}
            style={{ background: "var(--card)", fontSize: "0.75rem" }}
            title="Save this plan as one of your own tables"
          >
            <Download size={12} className="inline mr-1" aria-hidden />
            save to my tables
          </button>
          <button
            type="button"
            className="chip clickable"
            onClick={() => setImported(null)}
            style={{ background: "var(--card)", fontSize: "0.75rem" }}
            title="Remove this imported plan from the comparison"
          >
            <X size={12} className="inline mr-1" aria-hidden />
            remove
          </button>
        </div>
      )}

      {/* stats chips */}
      <div className="flex flex-wrap items-center" style={{ marginBottom: 10 }} aria-label={`Stats for table ${which}`}>
        <span className="chip" style={{ background: "var(--flex-bg)" }} title="Total credits">
          🎯 {fmtNum(st.totalCredits)} cr
        </span>
        <span className="chip" style={{ background: "var(--flex-bg)" }} title="Courses in this table">
          📚 {st.courseCount} courses
        </span>
        <span
          className="chip"
          style={{ background: st.clashCount > 0 ? "var(--bad)" : "var(--flex-bg)" }}
          title="Timetable clashes"
        >
          ⚠️ {st.clashCount} {st.clashCount === 1 ? "clash" : "clashes"}
        </span>
        <span className="chip" style={{ background: "var(--flex-bg)" }} title="Contact hours per week">
          ⏱ {fmtNum(st.contactHours)} hrs
        </span>
        <span
          className="chip"
          style={{ background: "var(--flex-bg)" }}
          title={st.freeDays.map((d) => DAY_LABELS[d]).join(", ") || "No free days"}
        >
          🎉 {st.freeDays.length} free {st.freeDays.length === 1 ? "day" : "days"}
        </span>
        <span className="chip" style={{ background: "var(--flex-bg)" }} title="Gaps between classes">
          🕳 {st.gapCount} {st.gapCount === 1 ? "gap" : "gaps"}
        </span>
      </div>

      {/* read-only mini grid (wide → horizontal scroll on small screens) */}
      <div className="ffcs-scroll" style={{ overflowX: "auto" }}>
        <TimetableGrid entries={tt.entries} campus={campus} />
      </div>
    </div>
  );

  /* course diff chip row ---------------------------------------------- */
  const renderDiffGroup = (
    title: string,
    list: CartEntry[],
    tint?: string,
    textColor?: string
  ) => (
    <div style={{ minWidth: 0 }}>
      <div className="ffcs-label" style={{ marginBottom: 6 }}>
        {title} ({list.length})
      </div>
      {list.length === 0 ? (
        <div style={{ color: "var(--muted-ink)", fontSize: "0.9rem" }}>—</div>
      ) : (
        <div className="ffcs-scroll flex flex-wrap" style={{ maxHeight: 420, overflowY: "auto", gap: 2 }}>
          {list.map((e) => (
            <span
              key={`${e.code}|${e.type}|${e.uid}`}
              className="chip"
              style={{
                background: tint || "var(--card)",
                color: textColor || "var(--ffcs-ink)",
                whiteSpace: "normal",
                maxWidth: "100%",
                lineHeight: 1.35,
                padding: "3px 9px",
              }}
              title={`${e.title} — ${e.faculty} (${e.slot})`}
            >
              <strong>{e.code}</strong> · {e.type} · {e.faculty} · {e.slot}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Compare tables">
      {/* header row: label + selects + swap */}
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
        <h3 className="ffcs-label" style={{ fontSize: "0.85rem", margin: 0 }}>
          Compare tables
        </h3>

        <label style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 220px", minWidth: 200 }}>
          <span className="ffcs-label" style={{ flex: "0 0 auto" }}>Table A</span>
          <select
            value={tableA.id}
            onChange={(e) => setASel(e.target.value)}
            style={selectStyle}
            aria-label="Select table A"
          >
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.entries.length} courses)
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 220px", minWidth: 200 }}>
          <span className="ffcs-label" style={{ flex: "0 0 auto" }}>Table B</span>
          {imported ? (
            <span
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2.5px solid var(--good-strong)",
                borderRadius: "14px 8px 12px 6px / 6px 12px 8px 14px",
                background: "var(--good-soft)",
                color: "var(--ffcs-ink)",
                fontSize: "0.9rem",
                padding: "8px 10px",
                minHeight: 44,
                whiteSpace: "normal",
                textAlign: "center",
              }}
              title="Table B is an imported shared plan — remove it in the strip below to pick one of yours"
            >
              🤝 {imported.name}
            </span>
          ) : (
            <select
              value={tableB.id}
              onChange={(e) => setBSel(e.target.value)}
              style={selectStyle}
              aria-label="Select table B"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.entries.length} courses)
                </option>
              ))}
            </select>
          )}
        </label>

        <button
          type="button"
          onClick={swap}
          className="chip clickable"
          disabled={!!imported}
          title={imported ? "Remove the imported plan first — Table B must be one of your tables" : "Swap which table is A and which is B"}
          style={{
            background: imported ? "var(--flex-bg)" : "var(--accent)",
            color: imported ? "var(--muted-ink)" : "var(--on-accent)",
            fontFamily: "inherit",
            fontSize: "0.9rem",
            padding: "10px 16px",
            minHeight: 44,
            opacity: imported ? 0.6 : 1,
            cursor: imported ? "not-allowed" : "pointer",
          }}
          aria-label="Swap table A and table B"
        >
          ⇄ Swap A/B
        </button>
      </div>

      {/* import a friend's shared plan */}
      <ImportFrame
        imported={imported}
        importVal={importVal}
        setImportVal={setImportVal}
        doImport={doImport}
        clearImport={() => setImported(null)}
        saveImported={saveImported}
        sendToGenerator={sendToGenerator}
      />

      {/* campus note — this build is Chennai-exclusive, no campus switch needed */}

      {/* A→B delta strip */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }} role="list" aria-label="Differences from table A to table B">
        {deltas.map((d) => {
          const delta = d.b - d.a;
          return (
            <span
              key={d.label}
              role="listitem"
              className="chip"
              style={{ background: "var(--flex-bg)", fontSize: "0.8rem" }}
              title={`${d.label}: A ${fmtNum(d.a)} → B ${fmtNum(d.b)} (${delta === 0 ? "same" : delta > 0 ? "+" : ""}${fmtNum(delta)})`}
            >
              {arrowFor(delta)} {d.label} {fmtNum(d.a)} → {fmtNum(d.b)}
            </span>
          );
        })}
      </div>

      {/* two table cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderCard(tableA, statsA, "A")}
        {renderCard(tableB, statsB, "B")}
      </div>

      {/* course diff */}
      <div className="p-3 md:p-4" style={{ ...cardStyle("10px 14px 8px 12px / 12px 8px 14px 6px"), marginTop: 16 }}>
        <h4 className="ffcs-label" style={{ fontSize: "0.85rem", marginTop: 0, marginBottom: 10 }}>
          Course diff
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderDiffGroup("In both plans", diff.shared, "var(--flex-bg)", "var(--muted-ink)")}
          {renderDiffGroup("Only in A", diff.onlyA, "var(--accent)")}
          {renderDiffGroup("Only in B", diff.onlyB, "var(--good)")}
        </div>
      </div>

      {/* merged plan check */}
      <div className="p-3 md:p-4" style={{ ...cardStyle("12px 6px 14px 8px / 8px 14px 6px 12px"), marginTop: 16 }}>
        <h4 className="ffcs-label" style={{ fontSize: "0.85rem", marginTop: 0, marginBottom: 10 }}>
          Merged plan check
        </h4>

        {mergedClashes.length === 0 ? (
          <div
            role="status"
            style={{
              background: "var(--good-soft)",
              border: "2.5px solid var(--ffcs-ink)",
              borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
              padding: "10px 14px",
              color: "var(--ffcs-ink)",
            }}
          >
            ✅ These two plans share no time conflicts — you could keep either without time regret
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mergedClashes.map((c) => {
              const ea = mergedByUid.get(c.aUid);
              const eb = mergedByUid.get(c.bUid);
              if (!ea || !eb) return null;
              return (
                <div
                  key={`${c.aUid}-${c.bUid}`}
                  role="alert"
                  style={{
                    background: "var(--bad-soft)",
                    border: "2px solid var(--danger)",
                    borderRadius: "10px 6px 12px 8px / 8px 12px 6px 10px",
                    padding: "8px 12px",
                    color: "var(--danger)",
                    fontSize: "0.9rem",
                  }}
                >
                  <strong>
                    {ea.code} ({ea.faculty})
                  </strong>{" "}
                  ×{" "}
                  <strong>
                    {eb.code} ({eb.faculty})
                  </strong>
                  <div style={{ fontSize: "0.78rem", marginTop: 2 }}>
                    {c.meetings.length > 0
                      ? c.meetings.map(meetingLabel).join(" · ")
                      : "same course registered twice"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--muted-ink)" }}>
          Duplicate courses (same code + type) are merged in the check, keeping Table A&apos;s
          section — you still can&apos;t register the same course twice.
        </p>
      </div>
    </section>
  );
}
