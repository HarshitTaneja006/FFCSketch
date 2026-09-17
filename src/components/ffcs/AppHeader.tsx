"use client";

/**
 * AppHeader — brand, table switcher (add/rename/delete/backup),
 * export PNG, share, clear actions. Chennai-campus build (no campus toggle).
 */

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  Copy,
  Download,
  Eraser,
  Moon,
  Pencil,
  Plus,
  Share2,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import { buildBackup, downloadBackup, parseBackupFile } from "@/lib/ffcs/backup";
import { toast } from "@/hooks/use-toast";

interface Props {
  onExportImage: () => void;
  onShare: () => void;
}

export default function AppHeader({ onExportImage, onShare }: Props) {
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const theme = useFFCS((s) => s.theme);
  const toggleTheme = useFFCS((s) => s.toggleTheme);
  const addTable = useFFCS((s) => s.addTable);
  const renameTable = useFFCS((s) => s.renameTable);
  const deleteTable = useFFCS((s) => s.deleteTable);
  const switchTable = useFFCS((s) => s.switchTable);
  const clearTable = useFFCS((s) => s.clearTable);
  const replaceEntries = useFFCS((s) => s.replaceEntries);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const active = tables.find((t) => t.id === activeTableId) || tables[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleAdd = () => {
    addTable();
    setMenuOpen(false);
    toast({ title: "New table created", description: "Add courses with the picker in the Timetable tab." });
  };

  const handleRename = (id: string) => {
    renameTable(id, renameValue);
    setRenamingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (tables.length === 1) {
      toast({ title: "Can't delete the last table", variant: "destructive" });
      return;
    }
    deleteTable(id);
    toast({ title: `Deleted "${name}"` });
  };

  const handleDuplicate = (id: string, name: string) => {
    const src = tables.find((t) => t.id === id);
    if (!src) return;
    const newId = addTable(`${name} copy`);
    if (src.entries.length > 0) replaceEntries(src.entries, newId);
    setMenuOpen(false);
    toast({
      title: `Duplicated "${name}"`,
      description: `${src.entries.length} courses copied — great for comparing plans!`,
    });
  };

  /** download every table + wishlist + colors as one .json file */
  const handleBackup = () => {
    try {
      const payload = buildBackup(useFFCS.getState());
      downloadBackup(payload);
      toast({
        title: "Backup downloaded 💾",
        description: `${payload.tables.length} table(s), ${payload.wishlist.length} wishlist course(s) — keep the .json safe!`,
      });
    } catch {
      toast({ title: "Backup failed", variant: "destructive" });
    }
  };

  /** restore everything from a previously downloaded backup file */
  const handleRestoreFile = async (file: File) => {
    setRestoring(true);
    try {
      const payload = await parseBackupFile(file);
      const res = useFFCS.getState().restoreBackup(payload);
      if (!res.ok) {
        toast({ title: res.reason || "Restore failed", variant: "destructive" });
        return;
      }
      toast({
        title: "Backup restored! 📂",
        description: `${res.tableCount} table(s) · wishlist, colors & theme came along for the ride`,
      });
    } catch (e) {
      toast({
        title: "Could not restore backup",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <header
      className="no-print"
      style={{
        background: "var(--card)",
        borderBottom: "3px solid var(--ffcs-ink)",
        position: "sticky",
        top: 0,
        zIndex: 200, // above papercss nav (z:100) so the table dropdown clears the tab bar
        boxShadow: "0 3px 0 var(--shadow-ink)",
      }}
    >
      <div
        className="mx-auto flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2"
        style={{ maxWidth: 1280 }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 mr-1">
          <div
            className="flex items-center justify-center"
            style={{
              width: 38,
              height: 38,
              border: "2.5px solid var(--ffcs-ink)",
              borderRadius: "12px 5px 14px 7px / 7px 14px 5px 12px",
              background: "var(--accent)",
              color: "var(--on-accent)",
              transform: "rotate(-3deg)",
              boxShadow: "2px 3px 0 var(--shadow-strong)",
            }}
          >
            <CalendarDays size={20} strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold" style={{ letterSpacing: "0.02em" }}>
              FFC<span className="sketch-underline">Sketch</span>
            </div>
            <div className="hidden sm:block" style={{ fontSize: "0.68rem", color: "var(--label-ink)", lineHeight: 1.35 }}>
              VIT Chennai · sketch your semester before you register
            </div>
          </div>
        </div>

        {/* Table switcher */}
        <div className="relative" ref={menuRef}>
          <button
            className="btn btn-small"
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              background: "var(--input)",
              fontFamily: "inherit",
              padding: "4px 12px",
              fontSize: "0.88rem",
            }}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
          >
            <span style={{ opacity: 0.6 }}>Table:</span>{" "}
            <strong>{active?.name || "—"}</strong>{" "}
            <span style={{ fontSize: "0.7rem" }}>▼</span>
          </button>
          {menuOpen && (
            <div
              role="listbox"
              className="absolute right-0 sm:right-auto sm:left-0 mt-1 p-2"
              style={{
                minWidth: 268,
                maxWidth: "calc(100vw - 24px)",
                background: "var(--card)",
                border: "2.5px solid var(--ffcs-ink)",
                borderRadius: "10px 5px 12px 6px / 6px 12px 5px 10px",
                boxShadow: "4px 5px 0 var(--shadow-ink)",
                zIndex: 60,
              }}
            >
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1 py-1 px-1 rounded"
                  style={{ background: t.id === activeTableId ? "var(--accent)" : undefined }}
                >
                  {renamingId === t.id ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(t.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1"
                        style={{
                          border: "2px solid var(--ffcs-ink)",
                          borderRadius: 6,
                          padding: "2px 6px",
                          fontFamily: "inherit",
                          fontSize: "0.85rem",
                          minWidth: 0,
                        }}
                      />
                      <button className="prio-btn" onClick={() => handleRename(t.id)} aria-label="Save name">
                        <Check size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="flex-1 text-left truncate"
                        style={{ fontSize: "0.9rem" }}
                        onClick={() => {
                          switchTable(t.id);
                          setMenuOpen(false);
                        }}
                      >
                        {t.id === activeTableId && <Check size={13} className="inline mr-1" />}
                        {t.name}
                        <span style={{ opacity: 0.55, fontSize: "0.72rem" }}> ({t.entries.length})</span>
                      </button>
                      <button
                        className="prio-btn"
                        title="Rename"
                        onClick={() => {
                          setRenamingId(t.id);
                          setRenameValue(t.name);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="prio-btn"
                        title="Duplicate table (great for comparing plans)"
                        onClick={() => handleDuplicate(t.id, t.name)}
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        className="prio-btn"
                        title="Delete"
                        onClick={() => handleDelete(t.id, t.name)}
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button
                className="btn btn-small btn-block mt-2"
                style={{
                  border: "2px dashed var(--ffcs-ink)",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                }}
                onClick={handleAdd}
              >
                <Plus size={14} className="inline mr-1" /> New table
              </button>
              <div className="flex gap-1 mt-2" style={{ borderTop: "2px dashed var(--cell-border)", paddingTop: 8 }}>
                <button
                  className="btn btn-small flex-1"
                  onClick={handleBackup}
                  title="Download all tables, wishlist & settings as a .json backup"
                  style={{
                    border: "2px solid var(--ffcs-ink)",
                    borderRadius: "8px 4px 10px 5px",
                    background: "var(--input)",
                    fontFamily: "inherit",
                    fontSize: "0.78rem",
                    padding: "5px 6px",
                  }}
                >
                  <Archive size={12} className="inline mr-1" /> Backup all
                </button>
                <button
                  className="btn btn-small flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoring}
                  title="Restore tables & settings from a backup .json file"
                  style={{
                    border: "2px solid var(--ffcs-ink)",
                    borderRadius: "8px 4px 10px 5px",
                    background: "var(--input)",
                    fontFamily: "inherit",
                    fontSize: "0.78rem",
                    padding: "5px 6px",
                  }}
                >
                  <Upload size={12} className="inline mr-1" /> {restoring ? "Restoring…" : "Restore"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleRestoreFile(f);
                }}
              />
            </div>
          )}
        </div>

        {/* Chennai campus badge (fixed — this build is Chennai-exclusive) */}
        <span
          className="chip"
          title="This planner is exclusive to VIT Chennai campus timings & courses"
          style={{ fontSize: "0.72rem" }}
        >
          📍 VIT Chennai
        </span>

        <div className="flex-1" />

        {/* Actions */}
        <button
          className="theme-btn"
          onClick={toggleTheme}
          title={theme === "night" ? "Switch to day paper theme" : "Switch to night sketch theme"}
          aria-label={theme === "night" ? "Switch to day paper theme" : "Switch to night sketch theme"}
        >
          {theme === "night" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="btn btn-small"
          onClick={onExportImage}
          title="Download the visible view as a PNG image (Timetable, Compare or Slot View)"
          style={{
            border: "2px solid var(--ffcs-ink)",
            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
            background: "var(--input)",
            fontFamily: "inherit",
            fontSize: "0.85rem",
            padding: "4px 10px",
          }}
        >
          <Download size={14} className="inline mr-1" /> PNG
        </button>
        <button
          className="btn btn-small"
          onClick={onShare}
          title="Share this timetable"
          style={{
            border: "2px solid var(--ffcs-ink)",
            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
            background: "var(--good)",
            fontFamily: "inherit",
            fontSize: "0.85rem",
            padding: "4px 10px",
          }}
        >
          <Share2 size={14} className="inline mr-1" /> Share
        </button>
        <button
          className="btn btn-small"
          onClick={() => {
            clearTable();
            toast({ title: "Table cleared" });
          }}
          title="Remove all courses from this table"
          style={{
            border: "2px solid var(--danger)",
            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
            background: "var(--input)",
            color: "var(--danger)",
            fontFamily: "inherit",
            fontSize: "0.85rem",
            padding: "4px 10px",
          }}
        >
          <Eraser size={14} className="inline mr-1" /> Clear
        </button>
      </div>
    </header>
  );
}
