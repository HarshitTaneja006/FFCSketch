/**
 * FFCSketch — client-side course data layer
 *
 * The app is FULLY CLIENT-SIDE: the entire Chennai course dataset is bundled
 * from `src/data/courses.json` (generated from the official Chennai course
 * allocation report) and queried right here — no backend, no database.
 *
 * These helpers replace the old /api/courses routes with synchronous,
 * in-memory filtering (identical shapes and sort orders).
 */

import rawCourses from "@/data/courses.json";
import {
  CourseGroupResult,
  CourseQueryResult,
  CourseSection,
  CourseSummary,
  CourseType,
} from "./types";
import { isFlexibleSection, parseSlotCodes } from "./slots";

export const ALL_SECTIONS = rawCourses as CourseSection[];

export interface SectionQuery {
  /** exact course code (case-insensitive) */
  code?: string;
  /** free text across code/title/faculty/slot */
  q?: string;
  /** comma separated course types (TH,ETH,ELA,LO,SS,EPJ,PJT,OC) */
  type?: string;
  /** exact credit value (string compare, e.g. "1.5") */
  credits?: string;
  /** individual slot code (any section whose slot string contains it) */
  slot?: string;
  /** only flexible/unscheduled sections */
  flexible?: boolean;
  sort?: "code" | "title" | "faculty" | "credits" | "slot";
  page?: number;
  limit?: number;
}

/** Filter + sort + paginate sections, mirroring the old API contract */
export function querySections(opts: SectionQuery = {}): CourseQueryResult {
  const code = (opts.code || "").trim().toUpperCase();
  const q = (opts.q || "").trim().toLowerCase();
  const types = (opts.type || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as CourseType[];
  const credits = (opts.credits || "").trim();
  const slot = (opts.slot || "").trim().toUpperCase();
  const sort = opts.sort || "code";
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(300, Math.max(1, opts.limit || 60));

  let items: CourseSection[] = ALL_SECTIONS;

  if (code) items = items.filter((c) => c.code === code);
  if (q) {
    items = items.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.faculty.toLowerCase().includes(q) ||
        c.slot.toLowerCase().includes(q)
    );
  }
  if (types.length > 0) items = items.filter((c) => types.includes(c.type));
  if (credits) items = items.filter((c) => String(c.credits) === credits);
  if (slot) items = items.filter((c) => parseSlotCodes(c.slot).includes(slot));
  if (opts.flexible) items = items.filter((c) => isFlexibleSection(c.slot));

  items = [...items];
  switch (sort) {
    case "title":
      items.sort((a, b) => a.title.localeCompare(b.title) || a.code.localeCompare(b.code));
      break;
    case "faculty":
      items.sort((a, b) => a.faculty.localeCompare(b.faculty) || a.code.localeCompare(b.code));
      break;
    case "credits":
      items.sort((a, b) => a.credits - b.credits || a.code.localeCompare(b.code));
      break;
    case "slot":
      items.sort((a, b) => a.slot.localeCompare(b.slot) || a.code.localeCompare(b.code));
      break;
    default:
      items.sort((a, b) => a.code.localeCompare(b.code) || a.type.localeCompare(b.type));
  }

  const total = items.length;
  const start = (page - 1) * limit;
  return { total, page, limit, sections: items.slice(start, start + limit) };
}

export interface GroupQuery {
  q?: string;
  type?: string;
  credits?: string;
  sort?: "code" | "title" | "sections" | "credits";
  page?: number;
  limit?: number;
}

/** Stage-1 grouped view: one summary per course code */
export function queryGroupedCourses(opts: GroupQuery = {}): CourseGroupResult {
  const q = (opts.q || "").trim().toLowerCase();
  const types = (opts.type || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as CourseType[];
  const credits = (opts.credits || "").trim();
  const sort = opts.sort || "code";
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));

  let items: CourseSection[] = ALL_SECTIONS;
  if (q) {
    items = items.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.faculty.toLowerCase().includes(q) ||
        c.slot.toLowerCase().includes(q)
    );
  }
  if (types.length > 0) items = items.filter((c) => types.includes(c.type));
  if (credits) items = items.filter((c) => String(c.credits) === credits);

  const byCode = new Map<string, CourseSummary>();
  for (const c of items) {
    let entry = byCode.get(c.code);
    if (!entry) {
      entry = {
        code: c.code,
        title: c.title,
        credits: c.credits,
        sectionCount: 0,
        facultyCount: 0,
        faculties: [],
        types: [],
      };
      byCode.set(c.code, entry);
    }
    entry.sectionCount += 1;
    if (!entry.faculties.includes(c.faculty)) entry.faculties.push(c.faculty);
    if (!entry.types.includes(c.type)) entry.types.push(c.type);
    if (c.credits > entry.credits) entry.credits = c.credits;
  }
  const courses = [...byCode.values()].map((v) => ({
    ...v,
    facultyCount: v.faculties.length,
    faculties: v.faculties.slice(0, 3),
    types: v.types.sort(),
  }));

  switch (sort) {
    case "title":
      courses.sort((a, b) => a.title.localeCompare(b.title) || a.code.localeCompare(b.code));
      break;
    case "sections":
      courses.sort((a, b) => b.sectionCount - a.sectionCount || a.code.localeCompare(b.code));
      break;
    case "credits":
      courses.sort((a, b) => a.credits - b.credits || a.code.localeCompare(b.code));
      break;
    default:
      courses.sort((a, b) => a.code.localeCompare(b.code));
  }

  const total = courses.length;
  const start = (page - 1) * limit;
  return { total, page, limit, courses: courses.slice(start, start + limit) };
}

/** All sections of one course, optionally filtered by type */
export function getSectionsByCode(code: string, type?: string): CourseSection[] {
  const c = (code || "").trim().toUpperCase();
  if (!c) return [];
  const t = (type || "").trim().toUpperCase();
  return ALL_SECTIONS.filter((s) => s.code === c && (!t || s.type === t));
}

/** Resolve a section by its identity triple (used by share links) */
export function findSectionByIdentity(
  code: string,
  slot: string,
  faculty: string,
  type?: string
): CourseSection | undefined {
  const c = (code || "").trim().toUpperCase();
  const s = (slot || "").trim().toUpperCase();
  const f = (faculty || "").trim();
  const t = (type || "").trim().toUpperCase();
  return ALL_SECTIONS.find(
    (x) =>
      x.code === c &&
      x.slot.toUpperCase() === s &&
      x.faculty.toUpperCase() === f.toUpperCase() &&
      (!t || x.type === t)
  );
}
