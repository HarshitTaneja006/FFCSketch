/**
 * FFCSketch — embedded course pairing (VIT FFCS rule)
 *
 * An EMBEDDED course is registered as ONE unit: the theory half (ETH) and the
 * lab half (ELA) share the same course code and MUST be with the SAME faculty.
 * One half without the other — or the two halves with different faculties — is
 * not a registrable combination on the official portal, so the app guards the
 * rule everywhere a section can enter a table:
 *
 *   CoursePicker  → adding an embedded half auto-adds its same-faculty partner
 *   CourseCart    → missing/mismatched pairs are flagged with one-click fixes
 *   Generator     → combos treat [ETH + ELA(same faculty)] as one unit
 */

import { ALL_SECTIONS } from "./courseData";
import { CartEntry, CourseSection, CourseType } from "./types";

/** ETH ⇄ ELA are the only paired types (TH/LO/PJT… stand alone) */
export function partnerTypeOf(type: string): CourseType | undefined {
  if (type === "ETH") return "ELA";
  if (type === "ELA") return "ETH";
  return undefined;
}

const normF = (f: string) => (f || "").trim().toUpperCase();
const normC = (c: string) => (c || "").trim().toUpperCase();

/** Dataset sections that complete `section`'s pair: same course code,
 *  complementary type (ETH⇄ELA) and the SAME faculty.
 *  Empty when that faculty publishes no such half. */
export function findEmbeddedPartners(
  section: Pick<CourseSection, "code" | "type" | "faculty">
): CourseSection[] {
  const partner = partnerTypeOf(section.type);
  if (!partner) return [];
  const f = normF(section.faculty);
  return ALL_SECTIONS.filter(
    (s) => normC(s.code) === normC(section.code) && s.type === partner && normF(s.faculty) === f
  );
}

/** One embedded-pair violation found in a table (deduped per course code) */
export interface PairProblem {
  code: string;
  /** "missing" = only one half is in the table; "mismatch" = both halves, different faculties */
  kind: "missing" | "mismatch";
  /** missing: the lone half currently in the table */
  lone?: CartEntry;
  /** mismatch: both conflicting halves */
  theory?: CartEntry;
  lab?: CartEntry;
  /** the half that `fixes` provides (added, or swapped in) */
  needType: CourseType;
  /** faculty the fix must match */
  needFaculty: string;
  /** dataset sections that complete/repair the pair (preferred fix first) */
  fixes: CourseSection[];
  /** mismatch only: uid of the half that `fixes` would replace */
  fixReplaceUid?: string;
}

/** Scan table entries for embedded-pair violations.
 *  Returns at most one problem per course code, with a canonical fix:
 *  mismatch keeps the THEORY half and swaps the lab to the theory's faculty
 *  when possible (falls back to swapping the theory to the lab's faculty). */
export function embeddedPairProblems(entries: CartEntry[]): PairProblem[] {
  const problems: PairProblem[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const needType = partnerTypeOf(e.type);
    const codeKey = normC(e.code);
    if (!needType || seen.has(codeKey)) continue;
    seen.add(codeKey);
    const partner = entries.find(
      (o) => normC(o.code) === codeKey && o.type === needType
    );
    if (partner && normF(partner.faculty) === normF(e.faculty)) continue; // ✅ valid pair
    if (partner) {
      const theory = e.type === "ETH" ? e : partner;
      const lab = e.type === "ETH" ? partner : e;
      // preferred fix: keep the theory, switch the lab to the theory's faculty
      const fixesLab = findEmbeddedPartners(theory);
      if (fixesLab.length > 0) {
        problems.push({
          code: e.code,
          kind: "mismatch",
          theory,
          lab,
          needType: "ELA",
          needFaculty: theory.faculty,
          fixes: fixesLab,
          fixReplaceUid: lab.uid,
        });
      } else {
        const fixesTheory = findEmbeddedPartners(lab);
        problems.push({
          code: e.code,
          kind: "mismatch",
          theory,
          lab,
          needType: "ETH",
          needFaculty: lab.faculty,
          fixes: fixesTheory,
          fixReplaceUid: theory.uid,
        });
      }
    } else {
      problems.push({
        code: e.code,
        kind: "missing",
        lone: e,
        needType,
        needFaculty: e.faculty,
        fixes: findEmbeddedPartners(e),
      });
    }
  }
  return problems;
}

/** uids of every entry involved in any pair problem (for per-card warnings) */
export function pairProblemUids(problems: PairProblem[]): Set<string> {
  const set = new Set<string>();
  for (const p of problems) {
    if (p.lone) set.add(p.lone.uid);
    if (p.theory) set.add(p.theory.uid);
    if (p.lab) set.add(p.lab.uid);
    if (p.fixReplaceUid) set.add(p.fixReplaceUid);
  }
  return set;
}
