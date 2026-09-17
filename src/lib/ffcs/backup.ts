/**
 * FFCSketch — full backup / restore (.json)
 *
 * Exports everything the planner keeps in localStorage (tables, wishlist,
 * course colors, campus, owner name, theme) into a single hand-portable JSON
 * file, and validates + parses such a file on the way back in.
 */

import { CartEntry, Campus, CourseSection, CourseType } from "./types";
import type { WishlistCourse } from "@/store/ffcs";

const COURSE_TYPES: CourseType[] = ["TH", "ETH", "ELA", "LO", "SS", "EPJ", "PJT", "OC"];

export interface BackupTable {
  id: string;
  name: string;
  createdAt: number;
  entries: CourseSection[];
}

export interface BackupPayload {
  /** "ffcs-planner" = legacy pre-rename backups — still accepted on restore */
  app: "ffcs-sketch" | "ffcs-planner";
  version: 1;
  exportedAt: string;
  campus: Campus;
  ownerName: string;
  theme: "day" | "night";
  activeTableId: string;
  tables: BackupTable[];
  wishlist: WishlistCourse[];
  courseColors: Record<string, number>;
}

interface BackupSource {
  campus: Campus;
  ownerName: string;
  theme: "day" | "night";
  activeTableId: string;
  tables: Array<{ id: string; name: string; createdAt: number; entries: CartEntry[] }>;
  wishlist: WishlistCourse[];
  courseColors: Record<string, number>;
}

/** Build a backup payload from the current store state. */
export function buildBackup(state: BackupSource): BackupPayload {
  return {
    app: "ffcs-sketch",
    version: 1,
    exportedAt: new Date().toISOString(),
    campus: state.campus === "chennai" ? "chennai" : "vellore",
    ownerName: state.ownerName || "",
    theme: state.theme === "night" ? "night" : "day",
    activeTableId: state.activeTableId,
    tables: state.tables.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      entries: t.entries.map(({ uid: _uid, ...rest }) => rest),
    })),
    wishlist: state.wishlist || [],
    courseColors: state.courseColors || {},
  };
}

/** Trigger a .json download of the payload. */
export function downloadBackup(payload: BackupPayload): void {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ffcs-sketch-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function sanitizeSection(raw: unknown): CourseSection | null {
  if (!isRecord(raw)) return null;
  const code = typeof raw.code === "string" ? raw.code.slice(0, 24) : null;
  if (!code) return null;
  const type = COURSE_TYPES.includes(raw.type as CourseType) ? (raw.type as CourseType) : "TH";
  return {
    id: typeof raw.id === "number" && isFinite(raw.id) ? Math.round(raw.id) : -1,
    code,
    title: typeof raw.title === "string" ? raw.title.slice(0, 200) : code,
    type,
    slot: typeof raw.slot === "string" ? raw.slot.slice(0, 40) : "NIL",
    faculty: typeof raw.faculty === "string" ? raw.faculty.slice(0, 120) : "TBA",
    credits: typeof raw.credits === "number" && isFinite(raw.credits) ? raw.credits : 0,
  };
}

/**
 * Read + validate a backup File. Resolves with a sanitized payload or
 * rejects with a human-readable reason.
 */
export function parseBackupFile(file: File): Promise<BackupPayload> {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("File too large — is this really an FFCS backup?"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      try {
        const raw: unknown = JSON.parse(String(reader.result));
        if (!isRecord(raw) || (raw.app !== "ffcs-sketch" && raw.app !== "ffcs-planner")) {
          reject(new Error("Not an FFCSketch backup file"));
          return;
        }
        const tablesRaw = Array.isArray(raw.tables) ? raw.tables : [];
        const tables: BackupTable[] = [];
        for (const t of tablesRaw) {
          if (!isRecord(t)) continue;
          const entriesRaw = Array.isArray(t.entries) ? t.entries : [];
          const entries = entriesRaw
            .map(sanitizeSection)
            .filter((e): e is CourseSection => e !== null);
          tables.push({
            id: typeof t.id === "string" ? t.id : `tt-${tables.length}`,
            name: typeof t.name === "string" && t.name.trim() ? t.name.slice(0, 80) : `Table ${tables.length + 1}`,
            createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
            entries,
          });
        }
        if (tables.length === 0) {
          reject(new Error("Backup contains no tables"));
          return;
        }
        const wishlistRaw = Array.isArray(raw.wishlist) ? raw.wishlist : [];
        const wishlist: WishlistCourse[] = wishlistRaw
          .filter((w): w is Record<string, unknown> => isRecord(w) && typeof w.code === "string")
          .map((w, i) => ({
            code: String(w.code).slice(0, 24).toUpperCase(),
            priority: typeof w.priority === "number" ? w.priority : i + 1,
            title: typeof w.title === "string" ? w.title.slice(0, 200) : "",
            lockedSectionId: typeof w.lockedSectionId === "number" ? w.lockedSectionId : null,
            lockedLabel: typeof w.lockedLabel === "string" ? w.lockedLabel.slice(0, 80) : undefined,
          }));
        const courseColors: Record<string, number> = {};
        if (isRecord(raw.courseColors)) {
          for (const [k, v] of Object.entries(raw.courseColors)) {
            if (typeof v === "number" && v >= 0 && v <= 9) courseColors[k.slice(0, 40)] = Math.round(v);
          }
        }
        resolve({
          app: "ffcs-sketch",
          version: 1,
          exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
          campus: raw.campus === "chennai" ? "chennai" : "vellore",
          ownerName: typeof raw.ownerName === "string" ? raw.ownerName.slice(0, 80) : "",
          theme: raw.theme === "night" ? "night" : "day",
          activeTableId: typeof raw.activeTableId === "string" ? raw.activeTableId : "",
          tables,
          wishlist,
          courseColors,
        });
      } catch {
        reject(new Error("Could not parse the file as JSON"));
      }
    };
    reader.readAsText(file);
  });
}
