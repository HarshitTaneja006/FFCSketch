/**
 * FFCSketch — XLSX / CSV course-list import
 *
 * Parses a user-uploaded spreadsheet (course allocation reports,
 * friend-made lists, club schedules…) into importable course sections.
 * Header detection is fuzzy: any reasonable spelling of
 * CODE / TITLE / TYPE / CREDITS / VENUE / FACULTY / SLOT works, in any column
 * order. The canonical format matches the official Chennai course report:
 * CODE · TITLE · TYPE · CREDITS · VENUE · SLOT · FACULTY.
 */

import type { CourseType } from "./types";

export interface XlsxRow {
  code: string;
  title: string;
  type: CourseType;
  credits: number;
  venue: string;
  faculty: string;
  slot: string;
  /** raw row number in the sheet (1-based, for error messages) */
  row: number;
}

export interface XlsxParseResult {
  rows: XlsxRow[];
  /** rows that had neither a code nor a title */
  skipped: number;
  /** detected column mapping (header name -> meaning) for the preview UI */
  mapping: Partial<Record<ColField, string>>;
  sheetName: string;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/* header keyword matchers, first hit wins (checked in order) */
type ColField = "code" | "title" | "type" | "credits" | "venue" | "faculty" | "slot";

const MATCHERS: Partial<Record<ColField, (h: string) => boolean>> = {
  code: (h) =>
    h === "code" ||
    h === "coursecode" ||
    h === "courscode" ||
    h === "courcecode" ||
    h === "subjectcode" ||
    h === "subcode" ||
    (h.includes("code") && (h.includes("course") || h.includes("subject"))),
  title: (h) => h === "title" || h === "coursetitle" || h === "coursename" || h === "subjectname" || h === "name" || h.includes("title"),
  type: (h) => h.includes("type") || h === "coursetype" || h === "category",
  credits: (h) => h === "credits" || h === "credit" || h === "cr" || h.includes("credit"),
  venue: (h) => h.includes("venue") || h.includes("room") || h.includes("location") || h.includes("classroom"),
  faculty: (h) => h.includes("facult") || h === "instructor" || h === "staff" || h === "teacher" || h === "professor",
  slot: (h) => h.includes("slot"),
};

const TYPE_MAP: Record<string, CourseType> = {
  TH: "TH",
  THEORY: "TH",
  ETH: "ETH",
  EMBEDDEDTHEORY: "ETH",
  ELA: "ELA",
  EMBEDDEDLAB: "ELA",
  LO: "LO",
  LAB: "LO",
  LABONLY: "LO",
  SS: "SS",
  SOFTSKILLS: "SS",
  EPJ: "EPJ",
  EMBEDDEDPROJECT: "EPJ",
  PJT: "PJT",
  PROJECT: "PJT",
  OC: "OC",
  OPENCOURSE: "OC",
};

function normalizeType(raw: string): CourseType {
  const key = norm(raw).toUpperCase();
  return TYPE_MAP[key] || "TH";
}

function parseCredits(raw: string): number {
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(20, Math.round(n * 10) / 10);
}

/** Find the header row: the first row (within the first 15) that matches ≥ 2 columns */
function findHeaderRow(grid: string[][]): number {
  for (let r = 0; r < Math.min(15, grid.length); r++) {
    let hits = 0;
    for (const cell of grid[r]) {
      const h = norm(cell);
      if (!h) continue;
      if (Object.values(MATCHERS).some((m) => m(h))) hits++;
    }
    if (hits >= 2) return r;
  }
  return -1;
}

export async function parseCourseWorkbook(file: File): Promise<XlsxParseResult> {
  // DoS guard: refuse huge workbooks before loading them fully into memory.
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File too large — please use a file under 5 MB");
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file has no sheets");
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (grid.length === 0) throw new Error("The first sheet is empty");

  const headerIdx = findHeaderRow(grid);
  if (headerIdx === -1) {
    throw new Error(
      "Couldn't find a header row with course columns (need at least CODE and TITLE or SLOT)"
    );
  }

  // map header cells -> fields
  const colOf: Partial<Record<ColField, number>> = {};
  const mapping: XlsxParseResult["mapping"] = {};
  grid[headerIdx].forEach((cell, c) => {
    const h = norm(cell);
    if (!h) return;
    for (const [field, matcher] of Object.entries(MATCHERS) as [ColField, (h: string) => boolean][]) {
      if (!matcher(h) || colOf[field] !== undefined) continue;
      colOf[field] = c;
      mapping[field] = String(cell).trim();
    }
  });

  if (colOf.code === undefined && colOf.title === undefined) {
    throw new Error("No CODE or TITLE column found — rename one column to 'CODE' or 'TITLE'");
  }

  const rows: XlsxRow[] = [];
  let skipped = 0;

  // DoS guard: cap the number of data rows walked even if the sheet is dense.
  const MAX_ROWS = 20000;
  const lastRow = Math.min(grid.length, headerIdx + 1 + MAX_ROWS);
  for (let r = headerIdx + 1; r < lastRow; r++) {
    const row = grid[r];
    const get = (field: ColField) => {
      const c = colOf[field];
      return c === undefined ? "" : String(row[c] ?? "").trim();
    };
    const code = get("code").toUpperCase();
    const title = get("title");
    if (!code && !title) {
      if (row.some((cell) => String(cell ?? "").trim())) skipped++;
      continue;
    }
    const slot = get("slot") || "NIL";
    rows.push({
      row: r + 1,
      code: (code || title.slice(0, 12).toUpperCase().replace(/\s+/g, "-")).slice(0, 24),
      title: (title || code).slice(0, 200),
      type: normalizeType(get("type")),
      credits: parseCredits(get("credits")),
      venue: get("venue").slice(0, 60),
      faculty: (get("faculty") || "TBA").slice(0, 120),
      slot: slot.toUpperCase().replace(/\s*\+\s*/g, "+").slice(0, 40) || "NIL",
    });
  }

  if (rows.length === 0) {
    throw new Error("No course rows found under the header row");
  }

  return { rows, skipped, mapping, sheetName };
}

/** download a 1-sheet sample .xlsx the user can fill in —
 *  same column layout as the official Chennai course report */
export async function downloadImportTemplate(): Promise<void> {
  const XLSX = await import("xlsx");
  const data = [
    ["CODE", "TITLE", "TYPE", "CREDITS", "VENUE", "SLOT", "FACULTY"],
    ["CSE2001", "Design and Analysis of Algorithms", "ETH", "4", "AB1-503", "A1+TA1", "RAJESH KUMAR"],
    ["BCHY101L", "Engineering Chemistry", "TH", "3", "AB2-201", "B2", "ANITA SHARMA"],
    ["MAT2001", "Discrete Mathematics", "TH", "4", "AB3-104", "E1+TE1", "KALYAN"],
    ["CLUB01", "Robotics Club", "PJT", "1", "AB1-G01", "L1+L2", "Custom / TBA"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 36 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "courses");
  XLSX.writeFile(wb, "ffcs-import-template.xlsx");
}
