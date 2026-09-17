"use client";

/**
 * XlsxImportDialog — bulk-import courses from a user spreadsheet.
 *
 * Accepts .xlsx / .xls / .csv with fuzzy headers (CODE, TITLE, TYPE, CREDITS,
 * FACULTY, SLOT in any order). Shows a live preview + duplicate/clash summary
 * before anything is written to the table. Rows land in the active table as
 * first-class entries (grid, clashes, CSV, share all work).
 *
 * Structure mirrors CustomCourseDialog: the outer component handles open/close
 * + Esc; the inner <ImportForm> mounts fresh on every open.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FileSpreadsheet, FileDown, Loader2, Upload } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import { CartEntry, COURSE_TYPE_LABELS } from "@/lib/ffcs/types";
import {
  downloadImportTemplate,
  parseCourseWorkbook,
  XlsxParseResult,
} from "@/lib/ffcs/xlsxImport";
import { clashWithEntries } from "@/lib/ffcs/timetable";
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
  width: "min(640px, 100%)",
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export function XlsxImportDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return <ImportForm onClose={onClose} />;
}

function ImportForm({ onClose }: { onClose: () => void }) {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const addManySections = useFFCS((s) => s.addManySections);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  const [parsed, setParsed] = useState<XlsxParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await parseCourseWorkbook(file);
      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setLoading(false);
    }
  };

  /** existing entries by code|type, for duplicate + clash previews */
  const inTable = useMemo(() => {
    const map = new Map<string, CartEntry>();
    for (const e of activeTable?.entries || []) map.set(`${e.code}|${e.type}`, e);
    return map;
  }, [activeTable]);

  /** rows classified: new / duplicate (same code+type in table) */
  const classified = useMemo(() => {
    if (!parsed) return [];
    const seen = new Set<string>(); // duplicates within the file itself
    return parsed.rows.map((row) => {
      const key = `${row.code}|${row.type}`;
      const isDupInFile = seen.has(key);
      seen.add(key);
      const existing = inTable.get(key);
      const clashUids =
        existing || isDupInFile
          ? []
          : clashWithEntries(
              { id: -1, code: row.code, title: row.title, type: row.type, credits: row.credits, slot: row.slot, faculty: row.faculty, venue: row.venue },
              activeTable?.entries || [],
              "chennai"
            );
      return { row, duplicate: !!existing || isDupInFile, clashCount: clashUids.length };
    });
  }, [parsed, inTable, activeTable]);

  const newCount = classified.filter((c) => !c.duplicate).length;
  const dupCount = classified.length - newCount;
  const clashCount = classified.filter((c) => !c.duplicate && c.clashCount > 0).length;

  const handleImport = () => {
    if (!parsed) return;
    // one batched store update — keeps the app responsive even for
    // whole-report imports (593+ rows)
    const fresh = classified.filter((c) => !c.duplicate).map((c) => ({
      id: -(Date.now() + c.row.row), // negative ids never collide with the dataset
      code: c.row.code,
      title: c.row.title,
      type: c.row.type,
      credits: c.row.credits,
      slot: c.row.slot,
      faculty: c.row.faculty,
      venue: c.row.venue || undefined,
    }));
    const added = addManySections(fresh);
    const failed = fresh.length - added;
    toast({
      title: `Imported ${added} course${added === 1 ? "" : "s"} from ${fileName} 📄`,
      description: [
        dupCount > 0 ? `${dupCount} skipped (already in table or repeated)` : null,
        failed > 0 ? `${failed} failed` : null,
        clashCount > 0 ? `⚠ ${clashCount} clash with your table` : "clash check passed",
      ]
        .filter(Boolean)
        .join(" · "),
      variant: clashCount > 0 ? "destructive" : "default",
    });
    onClose();
  };

  return (
    <div style={OVERLAY} onClick={onClose} role="presentation">
      <div
        style={CARD}
        role="dialog"
        aria-modal="true"
        aria-label="Import courses from a spreadsheet"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" style={CLOSE_BTN} onClick={onClose} aria-label="Close" title="Close (Esc)">
          ✕
        </button>

        <h3 style={{ margin: "0 0 2px", fontSize: "1.05rem" }}>📄 Import courses from XLSX / CSV</h3>
        <p className="ffcs-label" style={{ margin: "0 0 12px" }}>
          Course allocation report · friend&apos;s list · any spreadsheet with course columns
        </p>

        {/* drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a spreadsheet file to import"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="xlsx-drop"
          style={{
            border: `2.5px dashed ${dragOver ? "var(--accent)" : "var(--ffcs-ink)"}`,
            borderRadius: "12px 6px 14px 8px",
            background: dragOver ? "var(--good-soft)" : "var(--flex-bg)",
            padding: "18px 12px",
            textAlign: "center",
            cursor: "pointer",
            fontSize: "0.88rem",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> reading {fileName}…
            </span>
          ) : (
            <>
              <Upload size={18} aria-hidden style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />
              <strong>Drop an .xlsx / .csv here</strong> or click to choose
              <span style={{ display: "block", marginTop: 4, fontSize: "0.76rem", color: "var(--label-ink)" }}>
                Columns understood (any order): CODE · TITLE · TYPE · CREDITS · VENUE · FACULTY · SLOT
              </span>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          style={{ display: "none" }}
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2" style={{ fontSize: "0.78rem" }}>
          <button
            type="button"
            className="chip clickable"
            onClick={() => downloadImportTemplate()}
            title="Download a ready-made template spreadsheet"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <FileDown size={12} aria-hidden /> download template
          </button>
          {fileName && !loading && !error && parsed && (
            <span style={{ color: "var(--muted-ink)" }}>
              sheet “{parsed.sheetName}” · {parsed.rows.length} rows
              {parsed.skipped > 0 && ` · ${parsed.skipped} blank row${parsed.skipped > 1 ? "s" : ""} skipped`}
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 p-2"
            style={{
              border: "2px dashed var(--danger)",
              borderRadius: 8,
              background: "var(--bad)",
              color: "var(--danger)",
              fontSize: "0.84rem",
              fontWeight: 600,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* preview */}
        {parsed && (
          <div className="mt-3">
            <div className="ffcs-label" style={{ marginBottom: 4 }}>Preview — first rows</div>
            <div className="ffcs-scroll" style={{ maxHeight: 260, overflowY: "auto", border: "2px solid var(--cell-border)", borderRadius: 8 }}>
              <table
                className="table-alternating"
                style={{ width: "100%", fontSize: "0.76rem", borderCollapse: "collapse", tableLayout: "fixed" }}
              >
                <thead>
                  <tr style={{ background: "var(--head-bg)" }}>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: "16%" }}>Code</th>
                    <th style={{ padding: "4px 6px", textAlign: "left" }}>Title</th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: "13%" }}>Faculty</th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: "10%" }}>Venue</th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: "15%" }}>Slot</th>
                    <th style={{ padding: "4px 6px", width: 70 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classified.slice(0, 50).map((c, i) => (
                    <tr key={i} style={c.duplicate ? { opacity: 0.55 } : undefined}>
                      <td style={{ padding: "4px 6px", overflowWrap: "anywhere" }}>
                        <strong>{c.row.code}</strong>
                      </td>
                      <td style={{ padding: "4px 6px", overflowWrap: "anywhere" }}>{c.row.title}</td>
                      <td style={{ padding: "4px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.row.faculty}>
                        {c.row.faculty}
                      </td>
                      <td style={{ padding: "4px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.row.venue || ""}>
                        {c.row.venue || "—"}
                      </td>
                      <td style={{ padding: "4px 6px", overflowWrap: "anywhere" }}>
                        <span className="chip" style={{ fontSize: "0.64rem", padding: "0 5px" }}>{c.row.slot}</span>
                        <span style={{ fontSize: "0.64rem", color: "var(--label-ink)", marginLeft: 3 }}>
                          {COURSE_TYPE_LABELS[c.row.type] || c.row.type}
                        </span>
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "0.68rem" }}>
                        {c.duplicate ? (
                          <span style={{ color: "var(--muted-ink)" }}>duplicate</span>
                        ) : c.clashCount > 0 ? (
                          <span style={{ color: "var(--danger)", fontWeight: 700 }}>⚠ {c.clashCount} clash</span>
                        ) : (
                          <span style={{ color: "var(--good-strong)" }}>✓ ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 50 && (
              <div style={{ fontSize: "0.74rem", color: "var(--label-ink)", marginTop: 3 }}>
                …and {parsed.rows.length - 50} more rows
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-2" style={{ fontSize: "0.74rem" }}>
              <span className="chip" style={{ fontSize: "0.7rem", background: "var(--good-soft)" }}>
                {newCount} to add
              </span>
              {dupCount > 0 && (
                <span className="chip" style={{ fontSize: "0.7rem", opacity: 0.75 }}>{dupCount} duplicates skipped</span>
              )}
              {clashCount > 0 && (
                <span className="chip" style={{ fontSize: "0.7rem", borderColor: "var(--danger)", color: "var(--danger)" }}>
                  ⚠ {clashCount} will clash
                </span>
              )}
            </div>
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
            onClick={handleImport}
            disabled={!parsed || newCount === 0}
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              background: parsed && newCount > 0 ? "var(--good)" : "var(--tt6)",
              color: parsed && newCount > 0 ? "var(--on-accent, #fff)" : "var(--muted-ink)",
              fontFamily: "inherit",
              padding: "6px 16px",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: parsed && newCount > 0 ? "pointer" : "not-allowed",
              boxShadow: parsed && newCount > 0 ? "2px 3px 0 var(--shadow-strong)" : undefined,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <FileSpreadsheet size={14} aria-hidden /> Import {newCount > 0 ? newCount : ""} course{newCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
