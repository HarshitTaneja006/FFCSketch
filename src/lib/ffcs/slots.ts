/**
 * FFCSketch — VIT slot system (VIT CHENNAI campus only)
 *
 * Slot timing table reverse-engineered from FFCSonTheGo (vatz88) Fall 2026-27 data:
 *  - Chennai: 55-min periods (8:00, 8:55, 9:50, 10:45, 11:40, 12:35 ... )
 *    incl. noon S11/S15 and evening S1-S4 slots, TBB1/TDD1
 *  - Lab grid: 12 lab periods/day (L1-L30 morning, L31-L60 afternoon)
 *
 * All times are minutes-from-midnight. 8:00 => 480, 14:00 => 840.
 */

import { Day, Meeting, Campus } from "./types";

export const DAY_INDEX: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

export function t(time: string): number {
  // "8:00" | "14:50" -> minutes
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fmtTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function fmtTimeShort(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "p" : "a";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

/* ------------------------------------------------------------------ */
/* Lab period grid (shared by both campuses)                           */
/* ------------------------------------------------------------------ */

/** Morning lab period starts (P1..P6), afternoon (P7..P12) — 50 min each */
const LAB_MORNING_STARTS = [t("8:00"), t("8:50"), t("9:50"), t("10:40"), t("11:40"), t("12:30")];
const LAB_AFTERNOON_STARTS = [t("14:00"), t("14:50"), t("15:50"), t("16:40"), t("17:40"), t("18:30")];
export const LAB_PERIOD_STARTS = [...LAB_MORNING_STARTS, ...LAB_AFTERNOON_STARTS];

export const MORNING_ROWS = 6;
export const LUNCH_ROW = MORNING_ROWS; // row index in grid (visual)
export const TOTAL_ROWS = 12;

/** Lunch break — 1:20 PM to 2:00 PM at VIT Chennai (last morning period ends 13:20) */
export const LUNCH = { start: t("13:20"), end: t("14:00") };
/** "1:20 PM – 2:00 PM" — single source of truth for every lunch label */
export const LUNCH_LABEL = `${fmtTime(LUNCH.start)} – ${fmtTime(LUNCH.end)}`;
/** Extra row for V3-V7 (Vellore) / S1-S4 (Chennai) evening classes */
export const EXTRA_ROW = TOTAL_ROWS;

export function labPeriodRange(periodIdx: number): { start: number; end: number } {
  const start = LAB_PERIOD_STARTS[periodIdx];
  return { start, end: start + 50 };
}

/** L-number -> { day, periodIdx (0..11) } */
export const L_SLOT_MAP: Record<string, { day: Day; periodIdx: number }> = (() => {
  const map: Record<string, { day: Day; periodIdx: number }> = {};
  const days: Day[] = ["mon", "tue", "wed", "thu", "fri"];
  for (let d = 0; d < 5; d++) {
    for (let p = 0; p < 6; p++) {
      map[`L${d * 6 + p + 1}`] = { day: days[d], periodIdx: p };
      map[`L${30 + d * 6 + p + 1}`] = { day: days[d], periodIdx: p + 6 };
    }
  }
  return map;
})();

/* ------------------------------------------------------------------ */
/* Theory slot timing tables                                           */
/* ------------------------------------------------------------------ */

type TheoryRow = { start: number; end: number; days: Partial<Record<Day, string>> };

/** VIT Chennai campus — 55-min periods, includes TBB1/TDD1, S11/S15 noon and S1-S4 evening slots.
 *  This is the ONLY campus table in the app (Chennai-exclusive build). */
const CHENNAI_THEORY: TheoryRow[] = [
  { start: t("8:00"), end: t("8:50"), days: { mon: "A1", tue: "B1", wed: "C1", thu: "D1", fri: "E1" } },
  { start: t("8:55"), end: t("9:45"), days: { mon: "F1", tue: "G1", wed: "A1", thu: "B1", fri: "C1" } },
  { start: t("9:50"), end: t("10:40"), days: { mon: "D1", tue: "E1", wed: "F1", thu: "G1", fri: "TA1" } },
  { start: t("10:45"), end: t("11:35"), days: { mon: "TB1", tue: "TC1", wed: "TD1", thu: "TE1", fri: "TF1" } },
  { start: t("11:40"), end: t("12:30"), days: { mon: "TG1", tue: "TAA1", wed: "TBB1", thu: "TCC1", fri: "TDD1" } },
  { start: t("12:35"), end: t("13:20"), days: { mon: "S11", fri: "S15" } },
  { start: t("14:00"), end: t("14:50"), days: { mon: "A2", tue: "B2", wed: "C2", thu: "D2", fri: "E2" } },
  { start: t("14:55"), end: t("15:45"), days: { mon: "F2", tue: "G2", wed: "A2", thu: "B2", fri: "C2" } },
  { start: t("15:50"), end: t("16:40"), days: { mon: "D2", tue: "E2", wed: "F2", thu: "G2", fri: "TA2" } },
  { start: t("16:45"), end: t("17:35"), days: { mon: "TB2", tue: "TC2", wed: "TD2", thu: "TE2", fri: "TF2" } },
  { start: t("17:40"), end: t("18:30"), days: { mon: "TG2", tue: "TAA2", wed: "TBB2", thu: "TCC2", fri: "TDD2" } },
  { start: t("18:35"), end: t("19:25"), days: { mon: "S3", tue: "S1", wed: "S4", thu: "S2" } },
];

/* Slots that appear in data but have no published timing (LAW / PG / language courses) */
export const FLEX_SLOTS = new Set([
  "TAAA1", "TBBB1", "TCCC1", "TEE1", "TFF1",
  "SA", "SB", "SC", "SD",
  "I1", "I2", "I3", "I4", "I5", "I6",
  "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8",
  "N1", "N2", "N3", "N4",
  "R1", "R2", "R3", "R5", "R6", "R7", "R8", "R9", "R10",
  "U1", "U2", "U3", "U4", "U5",
]);

/** slot code -> meetings. Keyed by Campus for API compatibility; both keys hold the
 *  Chennai table because this build is Chennai-exclusive (legacy persisted data is
 *  migrated to chennai on rehydrate — see store/ffcs.ts). */
export const SLOT_MEETINGS: Record<Campus, Record<string, Meeting[]>> = (() => {
  const build = (rows: TheoryRow[]): Record<string, Meeting[]> => {
    const map: Record<string, Meeting[]> = {};
    for (const row of rows) {
      for (const [day, slot] of Object.entries(row.days) as [Day, string][]) {
        if (!slot) continue;
        (map[slot] ||= []).push({ day, start: row.start, end: row.end, isLab: false });
      }
    }
    return map;
  };
  const chennai = build(CHENNAI_THEORY);
  return { vellore: chennai, chennai };
})();

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Split a raw slot string into individual slot codes */
export function parseSlotCodes(slot: string): string[] {
  if (!slot || slot === "NIL") return [];
  return slot.split("+").map((s) => s.trim()).filter(Boolean);
}

/** Get all meetings for a section (theory + labs) — Chennai campus timings.
 *  Memoized: slot strings repeat across hundreds of sections, and clash
 *  detection re-queries them constantly (O(1) after first parse). */
const meetingsCache = new Map<string, Meeting[]>();
export function getSectionMeetings(slot: string, _campus: Campus = "chennai"): Meeting[] {
  const cached = meetingsCache.get(slot);
  if (cached) return cached;
  const meetings: Meeting[] = [];
  for (const code of parseSlotCodes(slot)) {
    if (FLEX_SLOTS.has(code)) continue;
    const theory = SLOT_MEETINGS.chennai[code];
    if (theory) {
      meetings.push(...theory);
      continue;
    }
    const lab = L_SLOT_MAP[code];
    if (lab) {
      const { start, end } = labPeriodRange(lab.periodIdx);
      meetings.push({ day: lab.day, start, end, isLab: true });
    }
  }
  meetingsCache.set(slot, meetings);
  return meetings;
}

/** True if a slot string contains at least one schedulable slot */
export function isSchedulable(slot: string): boolean {
  return getSectionMeetings(slot, "chennai").length > 0;
}

/** True if section should render in the "flexible" bucket */
export function isFlexibleSection(slot: string): boolean {
  const codes = parseSlotCodes(slot);
  return codes.length > 0 && !isSchedulable(slot);
}

/** Theory slot -> grid cells (lab period indices it overlaps), computed from times */
export function theorySlotToCells(meeting: Meeting, _campus: Campus = "chennai"): number[] {
  const cells: number[] = [];
  for (let p = 0; p < TOTAL_ROWS; p++) {
    const { start, end } = labPeriodRange(p);
    if (meeting.start < end && meeting.end > start) cells.push(p);
  }
  return cells;
}

/** Human readable meeting description e.g. "Mon 8:00-8:50" */
export function meetingLabel(m: Meeting): string {
  const dayShort = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" }[m.day];
  return `${dayShort} ${fmtTime(m.start)}–${fmtTime(m.end)}`;
}

/** All known theory slot codes for the slot view (Chennai campus) */
export function allTheorySlots(_campus: Campus = "chennai"): string[] {
  return Object.keys(SLOT_MEETINGS.chennai).sort();
}

/** All lab slot codes */
export function allLabSlots(): string[] {
  return Object.keys(L_SLOT_MAP).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}

/**
 * Reverse lookup: which slot codes have a class inside grid cell (day, periodIdx)?
 * Theory slots overlap the 50-min lab period; lab slots start exactly there.
 * Used by the timetable "click an empty cell" course finder.
 */
export function slotsAtCell(
  day: Day,
  periodIdx: number,
  _campus: Campus = "chennai"
): { slot: string; kind: "theory" | "lab" }[] {
  const { start, end } = labPeriodRange(periodIdx);
  const out: { slot: string; kind: "theory" | "lab" }[] = [];

  for (const [slot, meetings] of Object.entries(SLOT_MEETINGS.chennai)) {
    if (meetings.some((m) => m.day === day && m.start < end && m.end > start)) {
      out.push({ slot, kind: "theory" });
    }
  }
  for (const [slot, pos] of Object.entries(L_SLOT_MAP)) {
    if (pos.day === day && pos.periodIdx === periodIdx) {
      out.push({ slot, kind: "lab" });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.slot.localeCompare(b.slot) : a.kind === "theory" ? -1 : 1));
}
