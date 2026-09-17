"use client";

/**
 * FFCSketch — global client state
 * Multiple tables, cart entries, generator — persisted to localStorage.
 * Chennai-campus-exclusive build: campus is always "chennai".
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  CartEntry,
  Campus,
  CourseSection,
  GeneratedCombo,
  Timetable,
} from "@/lib/ffcs/types";
import { clashWithEntries, findClashes } from "@/lib/ffcs/timetable";
import { findEmbeddedPartners, partnerTypeOf } from "@/lib/ffcs/embedded";
import type { BackupPayload } from "@/lib/ffcs/backup";

/** Result of addSectionWithPair — describes the auto-added embedded partner */
export interface AddPairResult {
  ok: boolean;
  reason?: string;
  /** embedded partner section auto-added together with the clicked one */
  paired?: CourseSection;
  /** the partner was added but clashes with the table (count of clashing entries) */
  pairedClashCount?: number;
  /** no same-faculty partner exists in the course list — pair is incomplete */
  partnerMissing?: boolean;
}

/** Desired course for the generator wishlist */
export interface WishlistCourse {
  code: string;
  priority: number;
  title: string;
  /** optional pinned section (id) the generator must include */
  lockedSectionId?: number | null;
  /** display cache for the locked section */
  lockedLabel?: string;
}

/** Undo snapshot for the most recent removal / clear (in-memory only) */
export interface UndoSnapshot {
  kind: "remove" | "clear";
  tableId: string;
  tableName: string;
  entries: CartEntry[];
}

export interface FFCSState {
  /** always "chennai" in this build (kept for data-shape compatibility) */
  campus: Campus;
  tables: Timetable[];
  activeTableId: string;
  ownerName: string;
  hydrated: boolean;
  /** generator wishlist (persisted) */
  wishlist: WishlistCourse[];
  /** "day" = paper sketch, "night" = chalkboard sketch (persisted) */
  theme: "day" | "night";
  /** main timetable layout: "vertical" = days across the top, "horizontal" = days down the side (persisted) */
  gridOrientation: "vertical" | "horizontal";
  /** per-course color overrides, key `${code}|${type}` -> palette idx 0..9 (persisted) */
  courseColors: Record<string, number>;
  /** last removal/clear for undo (in-memory, NOT persisted) */
  lastUndo: UndoSnapshot | null;
  /** last generator results (in-memory, NOT persisted) — survives tab switches so peek → back keeps results */
  lastCombos: GeneratedCombo[] | null;
  /** wishlist signature the lastCombos were computed for */
  lastCombosSig: string;

  setOwnerName: (name: string) => void;
  setTheme: (theme: "day" | "night") => void;
  toggleTheme: () => void;
  setGridOrientation: (o: "vertical" | "horizontal") => void;

  setWishlist: (list: WishlistCourse[]) => void;
  /** Merge courses into the wishlist (deduped by code, appended priorities). Returns how many were added. */
  addToWishlist: (courses: { code: string; title?: string }[]) => number;

  setCourseColor: (key: string, idx: number | null) => void;

  activeTable: () => Timetable | undefined;

  addTable: (name?: string) => string;
  renameTable: (id: string, name: string) => void;
  deleteTable: (id: string) => void;
  switchTable: (id: string) => void;
  clearTable: (id?: string) => void;

  addSection: (section: CourseSection, tableId?: string) => { ok: boolean; reason?: string };
  /** Add a section AND, for embedded halves (ETH/ELA), auto-add the paired
   *  other half with the SAME faculty (VIT registers embedded pairs together).
   *  Never adds a second partner when one is already in the table (a faculty
   *  mismatch is surfaced by the course list instead). */
  addSectionWithPair: (section: CourseSection, tableId?: string) => AddPairResult;
  /** Bulk-add sections in ONE store update (xlsx report imports) —
   *  skips duplicates by code+type; returns how many were added. */
  addManySections: (sections: CourseSection[], tableId?: string) => number;
  removeEntry: (uid: string, tableId?: string) => void;
  /** Replace one entry with a new section of the SAME course+type (section switch). Full-table undo. */
  swapSection: (oldUid: string, section: CourseSection, tableId?: string) => { ok: boolean; reason?: string };
  replaceEntries: (entries: CourseSection[], tableId?: string) => void;
  undoLast: () => { ok: boolean; reason?: string; kind?: UndoSnapshot["kind"] };

  loadShared: (entries: CourseSection[], intoNewTable: boolean, name: string) => void;
  /** Register an undo snapshot manually (e.g. before the dice overwrites a table) */
  snapshotUndo: (kind: UndoSnapshot["kind"], tableId: string, tableName: string, entries: CartEntry[]) => void;
  /** Cache generator results so switching tabs (peek!) doesn't lose them */
  setLastCombos: (combos: GeneratedCombo[] | null, sig: string) => void;
  /** Replace everything with the contents of a validated backup payload */
  restoreBackup: (payload: BackupPayload) => { ok: boolean; reason?: string; tableCount?: number };
  markHydrated: () => void;
}

function newTable(name: string): Timetable {
  return {
    id: `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    entries: [],
    createdAt: Date.now(),
  };
}

let uidCounter = 0;
function entryUid(code: string): string {
  uidCounter += 1;
  return `e-${code}-${Date.now().toString(36)}-${uidCounter}`;
}

const DEFAULT_TABLE = "Default Table";

export const useFFCS = create<FFCSState>()(
  persist(
    (set, get) => ({
      campus: "chennai",
      tables: [newTable(DEFAULT_TABLE)],
      activeTableId: "", // fixed after hydration
      ownerName: "",
      hydrated: false,
      wishlist: [],
      theme: "day",
      gridOrientation: "vertical",
      courseColors: {},
      lastUndo: null,
      lastCombos: null,
      lastCombosSig: "",

      setOwnerName: (ownerName) => set({ ownerName }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "night" ? "day" : "night" })),
      setGridOrientation: (gridOrientation) => set({ gridOrientation }),

      setWishlist: (wishlist) => set({ wishlist }),

      addToWishlist: (courses) => {
        const { wishlist } = get();
        const existing = new Set(wishlist.map((w) => w.code));
        const fresh: WishlistCourse[] = [];
        for (const c of courses) {
          const code = (c.code || "").trim().toUpperCase();
          if (!code || existing.has(code)) continue;
          existing.add(code);
          fresh.push({ code, priority: wishlist.length + fresh.length + 1, title: c.title || "" });
        }
        if (fresh.length > 0) set({ wishlist: [...wishlist, ...fresh] });
        return fresh.length;
      },

      setCourseColor: (key, idx) =>
        set((s) => {
          const next = { ...s.courseColors };
          if (idx === null) delete next[key];
          else next[key] = idx;
          return { courseColors: next };
        }),

      activeTable: () => {
        const { tables, activeTableId } = get();
        return tables.find((t) => t.id === activeTableId) || tables[0];
      },

      addTable: (name) => {
        const { tables } = get();
        const id = `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const tt: Timetable = {
          id,
          name: name || `Table ${tables.length + 1}`,
          entries: [],
          createdAt: Date.now(),
        };
        set({ tables: [...tables, tt], activeTableId: id });
        return id;
      },

      renameTable: (id, name) =>
        set((s) => ({
          tables: s.tables.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)),
        })),

      deleteTable: (id) =>
        set((s) => {
          if (s.tables.length === 1) return s;
          const tables = s.tables.filter((t) => t.id !== id);
          const activeTableId = s.activeTableId === id ? tables[0].id : s.activeTableId;
          return { tables, activeTableId };
        }),

      switchTable: (id) => set({ activeTableId: id }),

      clearTable: (id) =>
        set((s) => {
          const tid = id || s.activeTableId;
          const table = s.tables.find((t) => t.id === tid);
          const lastUndo =
            table && table.entries.length > 0
              ? { kind: "clear" as const, tableId: tid, tableName: table.name, entries: table.entries }
              : s.lastUndo;
          return {
            lastUndo,
            tables: s.tables.map((t) => (t.id === tid ? { ...t, entries: [] } : t)),
          };
        }),

      addSection: (section, tableId) => {
        const state = get();
        const tid = tableId || state.activeTableId;
        const table = state.tables.find((t) => t.id === tid);
        if (!table) return { ok: false, reason: "table not found" };
        if (table.entries.some((e) => e.code === section.code && e.type === section.type)) {
          return { ok: false, reason: `${section.code} (${section.type}) is already in this table` };
        }
        const entry: CartEntry = { ...section, uid: entryUid(section.code) };
        set((s) => ({
          tables: s.tables.map((t) =>
            t.id === tid ? { ...t, entries: [...t.entries, entry] } : t
          ),
        }));
        return { ok: true };
      },

      addSectionWithPair: (section, tableId) => {
        const state = get();
        const tid = tableId || state.activeTableId;
        const table = state.tables.find((t) => t.id === tid);
        if (!table) return { ok: false, reason: "table not found" };
        const base = state.addSection(section, tid);
        if (!base.ok) return base;
        const needType = partnerTypeOf(section.type);
        if (!needType) return { ok: true };
        const entriesNow =
          get().tables.find((t) => t.id === tid)?.entries || [];
        // the other half is already in the table (any faculty — a faculty
        // mismatch is flagged in the course list, not silently overwritten)
        if (entriesNow.some((e) => e.code === section.code && e.type === needType)) {
          return { ok: true };
        }
        const partners = findEmbeddedPartners(section);
        if (partners.length === 0) return { ok: true, partnerMissing: true };
        // prefer a partner section that keeps the table clash-free
        const free = partners.filter(
          (p) => clashWithEntries(p, entriesNow, state.campus).length === 0
        );
        const pick = free[0] || partners[0];
        const res = get().addSection(pick, tid);
        if (!res.ok) return { ok: true, partnerMissing: true };
        return {
          ok: true,
          paired: pick,
          pairedClashCount:
            free.length === 0
              ? clashWithEntries(pick, entriesNow, state.campus).length
              : 0,
        };
      },

      addManySections: (sections, tableId) => {
        const state = get();
        const tid = tableId || state.activeTableId;
        const table = state.tables.find((t) => t.id === tid);
        if (!table) return 0;
        const taken = new Set(table.entries.map((e) => `${e.code}|${e.type}`));
        const fresh: CartEntry[] = [];
        for (const section of sections) {
          const key = `${section.code}|${section.type}`;
          if (taken.has(key)) continue;
          taken.add(key);
          fresh.push({ ...section, uid: entryUid(section.code) });
        }
        if (fresh.length === 0) return 0;
        set((s) => ({
          tables: s.tables.map((t) =>
            t.id === tid ? { ...t, entries: [...t.entries, ...fresh] } : t
          ),
        }));
        return fresh.length;
      },

      removeEntry: (uid, tableId) =>
        set((s) => {
          const tid = tableId || s.activeTableId;
          const table = s.tables.find((t) => t.id === tid);
          const removed = table?.entries.find((e) => e.uid === uid);
          const lastUndo = removed
            ? { kind: "remove" as const, tableId: tid, tableName: table?.name || "", entries: [removed] }
            : s.lastUndo;
          return {
            lastUndo,
            tables: s.tables.map((t) =>
              t.id === tid ? { ...t, entries: t.entries.filter((e) => e.uid !== uid) } : t
            ),
          };
        }),

      swapSection: (oldUid, section, tableId) => {
        const state = get();
        const tid = tableId || state.activeTableId;
        const table = state.tables.find((t) => t.id === tid);
        if (!table) return { ok: false, reason: "table not found" };
        const existing = table.entries.find((e) => e.uid === oldUid);
        if (!existing) return { ok: false, reason: "that section is no longer in the table" };
        // identity by slot+faculty (ids can drift for imported/restored tables)
        if (existing.slot === section.slot && existing.faculty === section.faculty) {
          return { ok: false, reason: "that section is already selected" };
        }
        const entry: CartEntry = { ...section, uid: entryUid(section.code) };
        const others = table.entries.filter((e) => e.uid !== oldUid);
        set((s) => ({
          lastUndo: { kind: "clear", tableId: tid, tableName: table.name, entries: table.entries },
          tables: s.tables.map((t) =>
            t.id === tid ? { ...t, entries: [...others, entry] } : t
          ),
        }));
        return { ok: true };
      },

      undoLast: () => {
        const state = get();
        const snap = state.lastUndo;
        if (!snap) return { ok: false, reason: "nothing to undo" };
        const table = state.tables.find((t) => t.id === snap.tableId);
        if (!table) return { ok: false, reason: "that table no longer exists" };
        if (snap.kind === "clear") {
          set((s) => ({
            lastUndo: null,
            tables: s.tables.map((t) =>
              t.id === snap.tableId ? { ...t, entries: snap.entries } : t
            ),
          }));
          return { ok: true, kind: "clear" as const };
        }
        // remove: re-add respecting the duplicate + clash rules
        const section = snap.entries[0];
        const res = state.addSection(section, snap.tableId);
        if (!res.ok) return { ok: false, reason: res.reason };
        set({ lastUndo: null });
        return { ok: true, kind: "remove" as const };
      },

      replaceEntries: (entries, tableId) =>
        set((s) => {
          const tid = tableId || s.activeTableId;
          const withUids: CartEntry[] = entries.map((e) => ({
            ...e,
            uid: entryUid(`${e.code}-${e.type}`),
          }));
          return {
            tables: s.tables.map((t) => (t.id === tid ? { ...t, entries: withUids } : t)),
          };
        }),

      loadShared: (entries, intoNewTable, name) => {
        const state = get();
        if (intoNewTable) {
          const id = state.addTable(name || "Shared Timetable");
          state.replaceEntries(entries, id);
        } else {
          state.replaceEntries(entries);
        }
      },

      snapshotUndo: (kind, tableId, tableName, entries) =>
        set({ lastUndo: { kind, tableId, tableName, entries } }),

      setLastCombos: (combos, sig) => set({ lastCombos: combos, lastCombosSig: sig }),

      restoreBackup: (payload) => {
        if (!payload || (payload.app !== "ffcs-sketch" && payload.app !== "ffcs-planner") || !Array.isArray(payload.tables) || payload.tables.length === 0) {
          return { ok: false, reason: "not a valid backup file" };
        }
        // fresh table ids so a restore can never collide with existing ids
        const idMap = new Map<string, string>();
        const tables: Timetable[] = payload.tables.map((t, i) => {
          const id = `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${i}`;
          idMap.set(t.id, id);
          return {
            id,
            name: t.name || `Table ${i + 1}`,
            createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
            entries: (t.entries || []).map((e) => ({ ...e, uid: entryUid(e.code) } as CartEntry)),
          };
        });
        const activeTableId = idMap.get(payload.activeTableId) || tables[0].id;
        set({
          campus: "chennai", // Chennai-exclusive build — always pin
          ownerName: payload.ownerName || "",
          theme: payload.theme === "night" ? "night" : "day",
          tables,
          activeTableId,
          wishlist: Array.isArray(payload.wishlist) ? payload.wishlist : [],
          courseColors: payload.courseColors && typeof payload.courseColors === "object" ? payload.courseColors : {},
          lastUndo: null,
        });
        return { ok: true, tableCount: tables.length };
      },

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "ffcs-planner-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        campus: s.campus,
        tables: s.tables,
        activeTableId: s.activeTableId,
        ownerName: s.ownerName,
        wishlist: s.wishlist,
        theme: s.theme,
        gridOrientation: s.gridOrientation,
        courseColors: s.courseColors,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // ensure valid active table id
          if (!state.tables.find((t) => t.id === state.activeTableId)) {
            state.activeTableId = state.tables[0]?.id || "";
          }
          // Chennai-exclusive build: migrate any legacy persisted campus
          if (state.campus !== "chennai") state.campus = "chennai";
          state.hydrated = true;
        }
      },
    }
  )
);

/** helper: clashing uids for entries in a table */
export function getClashUids(entries: CartEntry[], campus: Campus): Set<string> {
  const clashes = findClashes(entries, campus);
  const set = new Set<string>();
  clashes.forEach((c) => {
    set.add(c.aUid);
    set.add(c.bUid);
  });
  return set;
}
