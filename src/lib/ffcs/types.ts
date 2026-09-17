/**
 * FFCSketch — Core types
 * VIT Fully Flexible Credit System timetable planning
 */

export type Day = "mon" | "tue" | "wed" | "thu" | "fri";

export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];
export const DAY_LABELS: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
};

export type CourseType = "TH" | "ETH" | "ELA" | "LO" | "SS" | "EPJ" | "PJT" | "OC";

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  TH: "Theory",
  ETH: "Embedded Theory",
  ELA: "Embedded Lab",
  LO: "Lab Only",
  SS: "Soft Skills",
  EPJ: "Embedded Project",
  PJT: "Project",
  OC: "Open Course",
};

/** One registrable section of a course (course + faculty + slot offering) */
export interface CourseSection {
  id: number;
  code: string;
  title: string;
  type: CourseType;
  credits: number;
  /** Raw slot string, e.g. "A1+TA1+TAA1", "L1+L2", "NIL".
   *  Real Chennai report data also carries section-specific suffix codes
   *  (e.g. "D1+TD1+TD5D21822") — unknown codes are ignored by the engine. */
  slot: string;
  faculty: string;
  /** Classroom / lab venue from the Chennai course report (may be absent on
   *  custom or imported courses) */
  venue?: string;
}

/** Stage-1 grouped course summary for the 2-stage picker */
export interface CourseSummary {
  code: string;
  title: string;
  credits: number;
  sectionCount: number;
  facultyCount: number;
  faculties: string[];
  types: string[];
}

/** A section added to a timetable (cart entry) */
export interface CartEntry extends CourseSection {
  uid: string; // unique within a table
}

export interface Timetable {
  id: string;
  name: string;
  entries: CartEntry[];
  createdAt: number;
}

export type Campus = "vellore" | "chennai";

/** A single class meeting in absolute minutes-from-midnight */
export interface Meeting {
  day: Day;
  start: number; // minutes from 00:00
  end: number;
  /** true if this meeting is a lab (long block) */
  isLab: boolean;
}

/** Clash info between two entries */
export interface ClashInfo {
  aUid: string;
  bUid: string;
  meetings: Meeting[];
}

/** A block to render on the timetable grid */
export interface GridBlock {
  uid: string;
  code: string;
  title: string;
  type: string;
  faculty: string;
  slotLabel: string;
  credits: number;
  /** classroom / lab room (when known from the course report) */
  venue?: string;
  day: Day;
  rowStart: number;
  rowSpan: number;
  colorIdx: number;
  isClash: boolean;
  isFlex: boolean;
  /** true for pencil-in "peek" previews from the Generator (dashed, non-interactive) */
  isGhost?: boolean;
}

/** Generated timetable combination */
export interface GeneratedCombo {
  id: string;
  sections: CourseSection[];
  droppedCodes: string[]; // courses that couldn't fit (lowest priority dropped first)
  score: number;
  freeDays: Day[];
  gapCount: number;
  earliestStart: number | null;
  latestEnd: number | null;
  totalCredits: number;
}

export interface GeneratorInput {
  code: string;
  priority: number; // 1 = highest
  /** optional pinned section (id within sectionsByCode[code]) the generator MUST include */
  lockedSectionId?: number | null;
}

/** Hard filters that constrain which sections the generator may pick */
export interface GeneratorPrefs {
  /** keep only theory slots that END before lunch (labs are never filtered) */
  morningTheory?: boolean;
  /** keep only theory slots that START after lunch (labs are never filtered) */
  eveningTheory?: boolean;
}

/** Result of a grouped-courses query */
export interface CourseGroupResult {
  total: number;
  page: number;
  limit: number;
  courses: CourseSummary[];
}

/** Result of a sections query */
export interface CourseQueryResult {
  total: number;
  page: number;
  limit: number;
  sections: CourseSection[];
}
