/**
 * FFCSketch — timetable logic
 * Clash detection (exact interval overlap), grid building, stats, auto-generator.
 */

import {
  CartEntry,
  ClashInfo,
  Campus,
  CourseSection,
  Day,
  DAYS,
  GeneratedCombo,
  GeneratorInput,
  GeneratorPrefs,
  GridBlock,
  Meeting,
} from "./types";
import {
  getSectionMeetings,
  parseSlotCodes,
  theorySlotToCells,
  L_SLOT_MAP,
  SLOT_MEETINGS,
  MORNING_ROWS,
  TOTAL_ROWS,
  EXTRA_ROW,
  fmtTime,
  LUNCH,
} from "./slots";

/** theory meeting lookup for the current (Chennai) campus */
const SLOT_MEETINGS_CHENNAI = SLOT_MEETINGS.chennai;

export const GRID_COLORS = 10;

/* ------------------------------------------------------------------ */
/* Clash detection                                                     */
/* ------------------------------------------------------------------ */

function overlap(a: Meeting, b: Meeting): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

/** Find all clashing pairs among entries */
export function findClashes(entries: CartEntry[], campus: Campus = "chennai"): ClashInfo[] {
  const clashes: ClashInfo[] = [];
  const meetingsCache = entries.map((e) => getSectionMeetings(e.slot, campus));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.code === b.code && a.type === b.type) {
        // duplicate section of same course+type — treat as a clash (can't register twice)
        clashes.push({ aUid: a.uid, bUid: b.uid, meetings: [] });
        continue;
      }
      const overlaps: Meeting[] = [];
      for (const ma of meetingsCache[i]) {
        for (const mb of meetingsCache[j]) {
          if (overlap(ma, mb)) overlaps.push(ma);
        }
      }
      if (overlaps.length > 0) {
        clashes.push({ aUid: a.uid, bUid: b.uid, meetings: dedupeMeetings(overlaps) });
      }
    }
  }
  return clashes;
}

function dedupeMeetings(ms: Meeting[]): Meeting[] {
  const seen = new Set<string>();
  const out: Meeting[] = [];
  for (const m of ms) {
    const k = `${m.day}|${m.start}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out.sort((x, y) => DAY_INDEXOF(x.day) - DAY_INDEXOF(y.day) || x.start - y.start);
}

const DAY_INDEXOF = (d: Day) => DAYS.indexOf(d);

const normFaculty = (f: string) => (f || "").trim().toUpperCase();

/** Does `section` clash with any of `entries`? Returns clashing uids. */
export function clashWithEntries(
  section: CourseSection,
  entries: CartEntry[],
  campus: Campus = "chennai"
): string[] {
  const sms = getSectionMeetings(section.slot, campus);
  const clashing: string[] = [];
  for (const e of entries) {
    if (e.code === section.code && e.type === section.type) {
      clashing.push(e.uid);
      continue;
    }
    const ems = getSectionMeetings(e.slot, campus);
    if (sms.some((sm) => ems.some((em) => overlap(sm, em)))) clashing.push(e.uid);
  }
  return clashing;
}

/** Is a combo of sections clash-free? */
export function isComboClashFree(sections: CourseSection[], campus: Campus = "chennai"): boolean {
  const cache = sections.map((s) => getSectionMeetings(s.slot, campus));
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[i].code === sections[j].code && sections[i].type === sections[j].type) return false;
      if (cache[i].some((a) => cache[j].some((b) => overlap(a, b)))) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Grid building                                                       */
/* ------------------------------------------------------------------ */

interface BlockDraft {
  uid: string;
  code: string;
  title: string;
  type: string;
  faculty: string;
  slotLabel: string;
  credits: number;
  venue?: string;
  day: Day;
  cells: number[];
  isFlex: boolean;
}

/** Build renderable grid blocks from cart entries */
export function buildGridBlocks(entries: CartEntry[], campus: Campus = "chennai"): GridBlock[] {
  const clashes = findClashes(entries, campus);
  const clashUids = new Set<string>();
  clashes.forEach((c) => {
    clashUids.add(c.aUid);
    clashUids.add(c.bUid);
  });

  const drafts: BlockDraft[] = [];
  entries.forEach((entry, idx) => {
    const codes = parseSlotCodes(entry.slot);
    /** Real Chennai report slots carry section-specific suffix codes (e.g.
     *  "D1+TD1+TD5D21822") — unknown codes only mean "flexible" when the
     *  section has NO schedulable code at all. */
    const hasKnown = codes.some(
      (c) => c !== "NIL" && (Boolean(SLOT_MEETINGS_CHENNAI[c]) || Boolean(L_SLOT_MAP[c]))
    );
    /** lab slot codes grouped by day — merged into ONE block per consecutive run
     *  (VIT labs are always held together: L1+L2, L3+L4, L35+L36 = one long session) */
    const labsByDay = new Map<Day, { code: string; p: number }[]>();
    for (const code of codes) {
      const theory = getSectionMeetings(code, campus).filter((m) => !m.isLab);
      const lab = L_SLOT_MAP[code];
      if (theory.length > 0) {
        // theory slot: merge cells per day
        const byDay = new Map<Day, number[]>();
        for (const m of theory) {
          const cells = theorySlotToCells(m, campus);
          if (cells.length === 0 && m.start >= 1140) {
            // late evening slots with no grid column
            pushToMap(byDay, m.day, EXTRA_ROW);
          } else {
            for (const c of cells) pushToMap(byDay, m.day, c);
          }
        }
        for (const [day, cells] of byDay) {
          drafts.push(makeDraft(entry, code, day, cells, idx, false));
        }
      } else if (lab) {
        const arr = labsByDay.get(lab.day) || [];
        arr.push({ code, p: lab.periodIdx });
        labsByDay.set(lab.day, arr);
      } else if (code === "NIL" || hasKnown) {
        // unscheduled section (projects) or a section-specific suffix code — nothing to render
      } else {
        // flexible slot — render in flex bucket
        drafts.push(makeDraft(entry, code, "mon", [], idx, true));
      }
    }
    // flush merged lab runs: consecutive periods become a single tall block
    for (const [day, labs] of labsByDay) {
      labs.sort((a, b) => a.p - b.p);
      let run: { code: string; p: number }[] = [];
      const flushRun = () => {
        if (run.length === 0) return;
        const label = run.map((r) => r.code).join("+");
        drafts.push(makeDraft(entry, label, day, run.map((r) => r.p), idx, false));
        run = [];
      };
      for (const l of labs) {
        const prev = run[run.length - 1];
        // consecutive periods merge — but NEVER across the lunch break (P6 ends 13:20, P7 starts 14:00)
        if (prev && l.p === prev.p + 1 && !(prev.p === MORNING_ROWS - 1 && l.p === MORNING_ROWS)) {
          run.push(l);
        } else {
          flushRun();
          run.push(l);
        }
      }
      flushRun();
    }
    // sections with NIL only
    if (codes.length === 0) {
      // nothing to render
    }
  });

  // merge contiguous cells into rowSpans and emit blocks
  const blocks: GridBlock[] = [];
  for (const d of drafts) {
    if (d.isFlex) {
      blocks.push(toGridBlock(d, EXTRA_ROW, 1, clashUids.has(d.uid)));
      continue;
    }
    const sorted = [...new Set(d.cells)].sort((a, b) => a - b);
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      blocks.push(toGridBlock(d, run[0], run.length, clashUids.has(d.uid)));
      run = [];
    };
    for (const c of sorted) {
      if (run.length === 0 || c === run[run.length - 1] + 1) run.push(c);
      else {
        flush();
        run.push(c);
      }
    }
    flush();
  }
  return blocks;
}

function pushToMap(map: Map<Day, number[]>, day: Day, cell: number) {
  const arr = map.get(day) || [];
  if (!arr.includes(cell)) arr.push(cell);
  map.set(day, arr);
}

function makeDraft(
  entry: CartEntry,
  slotCode: string,
  day: Day,
  cells: number[],
  colorIdx: number,
  isFlex: boolean
): BlockDraft {
  return {
    uid: entry.uid,
    code: entry.code,
    title: entry.title,
    type: entry.type,
    faculty: entry.faculty,
    slotLabel: slotCode,
    credits: entry.credits,
    venue: entry.venue,
    day,
    cells,
    isFlex,
  };
}

function toGridBlock(d: BlockDraft, rowStart: number, rowSpan: number, isClash: boolean): GridBlock {
  return {
    uid: d.uid,
    code: d.code,
    title: d.title,
    type: d.type,
    faculty: d.faculty,
    slotLabel: d.slotLabel,
    credits: d.credits,
    venue: d.venue,
    day: d.day,
    rowStart,
    rowSpan,
    colorIdx: Math.abs(hashCode(d.code + d.slotLabel)) % GRID_COLORS,
    isClash,
    isFlex: d.isFlex,
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export interface TableStats {
  totalCredits: number;
  courseCount: number;
  clashCount: number;
  freeDays: Day[];
  busyHours: Record<Day, number>;
  earliestStart: number | null;
  latestEnd: number | null;
  gapCount: number;
  contactHours: number;
}

export function computeStats(entries: CartEntry[], campus: Campus = "chennai"): TableStats {
  const clashes = findClashes(entries, campus);
  const meetings: Meeting[] = [];
  for (const e of entries) meetings.push(...getSectionMeetings(e.slot, campus));

  const busyHours: Record<Day, number> = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
  const byDay = new Map<Day, Meeting[]>();
  for (const m of meetings) {
    busyHours[m.day] += (m.end - m.start) / 60;
    (byDay.get(m.day) || byDay.set(m.day, []).get(m.day)!).push(m);
  }

  const freeDays = DAYS.filter((d) => (byDay.get(d) || []).length === 0);

  let earliestStart: number | null = null;
  let latestEnd: number | null = null;
  let gapCount = 0;
  for (const day of DAYS) {
    const dayMeetings = (byDay.get(day) || []).sort((a, b) => a.start - b.start);
    if (dayMeetings.length === 0) continue;
    const start = dayMeetings[0].start;
    const end = dayMeetings[dayMeetings.length - 1].end;
    if (earliestStart === null || start < earliestStart) earliestStart = start;
    if (latestEnd === null || end > latestEnd) latestEnd = end;
    for (let i = 1; i < dayMeetings.length; i++) {
      const gap = dayMeetings[i].start - dayMeetings[i - 1].end;
      if (gap > 10) gapCount++;
    }
  }

  const totalCredits = entries.reduce((s, e) => s + e.credits, 0);
  const contactHours = meetings.reduce((s, m) => s + (m.end - m.start) / 60, 0);

  return {
    totalCredits,
    courseCount: entries.length,
    clashCount: clashes.length,
    freeDays,
    busyHours,
    earliestStart,
    latestEnd,
    gapCount,
    contactHours: Math.round(contactHours * 10) / 10,
  };
}

/* ------------------------------------------------------------------ */
/* Auto generator (FFCS-inator style, priority based)                  */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  maxResults?: number;
  allowDrop?: number; // how many lowest-priority courses may be dropped
  /** hard filters that constrain candidate sections (see GeneratorPrefs) */
  prefs?: GeneratorPrefs;
}

export function generateTimetables(
  desired: GeneratorInput[],
  sectionsByCode: Record<string, CourseSection[]>,
  campus: Campus = "chennai",
  opts: GenerateOptions = {}
): GeneratedCombo[] {
  const { maxResults = 60, allowDrop = 2, prefs } = opts;
  /* theory-window hard filter: exactly two switches —
   *  🌅 morning theory  → every THEORY meeting ends by lunch (labs never filtered)
   *  🌆 evening theory  → every THEORY meeting starts after lunch
   * both on (or both off) = no theory-window restriction */
  const morningOnly = prefs?.morningTheory === true && prefs?.eveningTheory !== true;
  const eveningOnly = prefs?.eveningTheory === true && prefs?.morningTheory !== true;
  const theoryWindowOk = (slot: string) => {
    if (!morningOnly && !eveningOnly) return true;
    const theory = getSectionMeetings(slot, campus).filter((m) => !m.isLab);
    if (theory.length === 0) return true; // lab-only / unscheduled sections pass freely
    if (morningOnly) return theory.every((m) => m.end <= LUNCH.start);
    return theory.every((m) => m.start >= LUNCH.end);
  };
  const codes = desired.map((d) => d.code);
  const priorityOf: Record<string, number> = {};
  desired.forEach((d) => (priorityOf[d.code] = d.priority));

  // locked section resolution — code -> the exact section that must be included
  const lockedSectionByCode = new Map<string, CourseSection>();
  for (const d of desired) {
    if (d.lockedSectionId == null) continue;
    const found = (sectionsByCode[d.code] || []).find((s) => s.id === d.lockedSectionId);
    if (found) lockedSectionByCode.set(d.code, found);
  }

  const results: CourseSection[][] = [];
  const MAX_NODES = 400_000;
  let nodes = 0;

  /* Candidate UNITS per code. For an EMBEDDED course (a code with both ETH and
   * ELA sections) the unit is the theory+lab PAIR with the SAME faculty — the
   * official portal registers embedded halves together, so every combo must
   * carry both. Each same-faculty lab slot becomes one unit option. */
  const unitsByCode = new Map<string, CourseSection[][]>();
  for (const d of desired) {
    const sections = sectionsByCode[d.code] || [];
    const hasETH = sections.some((s) => s.type === "ETH");
    const hasELA = sections.some((s) => s.type === "ELA");
    const units: CourseSection[][] = [];
    if (hasETH && hasELA) {
      const eths = sections.filter((s) => s.type === "ETH");
      const elas = sections.filter((s) => s.type === "ELA");
      for (const eth of eths) {
        const labs = elas.filter((l) => normFaculty(l.faculty) === normFaculty(eth.faculty));
        if (labs.length === 0) units.push([eth]); // no same-faculty lab published — theory stands alone (flagged in the course list)
        else for (const lab of labs) units.push([eth, lab]);
      }
      // labs whose faculty has no theory half cannot form a registrable unit
    } else {
      for (const s of sections) units.push([s]);
    }
    unitsByCode.set(d.code, units);
  }

  const dfs = (order: string[], idx: number, chosen: CourseSection[]) => {
    if (results.length >= maxResults || nodes > MAX_NODES) return;
    if (idx === order.length) {
      results.push([...chosen]);
      return;
    }
    const code = order[idx];
    const locked = lockedSectionByCode.get(code);
    const allUnits = unitsByCode.get(code) || [];
    // a pinned section is an explicit user choice — it bypasses the window filter
    const options = locked
      ? allUnits.filter((u) => u.some((s) => s.id === locked.id))
      : allUnits.filter((u) => u.every((s) => theoryWindowOk(s.slot)));
    for (const unit of options) {
      nodes++;
      if (nodes > MAX_NODES) return;
      // fast clash check against chosen — every section of the unit must fit
      let ok = true;
      for (const opt of unit) {
        const sms = getSectionMeetings(opt.slot, campus);
        for (const c of chosen) {
          if (c.code === opt.code && c.type === opt.type) {
            ok = false;
            break;
          }
          const cms = getSectionMeetings(c.slot, campus);
          if (sms.some((sm) => cms.some((cm) => overlap(sm, cm)))) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      if (ok) {
        chosen.push(...unit);
        dfs(order, idx + 1, chosen);
        chosen.length -= unit.length;
      }
      if (results.length >= maxResults) return;
    }
  };

  // order courses by fewest options first for faster pruning
  const sortByOptions = (list: string[]) =>
    [...list].sort((a, b) => (sectionsByCode[a]?.length || 0) - (sectionsByCode[b]?.length || 0));

  dfs(sortByOptions(codes), 0, []);

  // Phase 2: allow dropping lowest-priority courses if nothing found
  // (locked courses are never dropped)
  if (results.length === 0 && allowDrop > 0 && codes.length > 1) {
    const droppable = desired.filter((d) => !lockedSectionByCode.has(d.code));
    const byPriority = [...droppable].sort((a, b) => b.priority - a.priority); // lowest priority (highest number) first
    for (let drop = 1; drop <= Math.min(allowDrop, droppable.length); drop++) {
      const droppedCodes = byPriority.slice(0, drop).map((d) => d.code);
      const kept = codes.filter((c) => !droppedCodes.includes(c));
      dfs(sortByOptions(kept), 0, []);
      if (results.length > 0) break;
    }
  }

  // Dedupe by section id set
  const seen = new Set<string>();
  const unique: CourseSection[][] = [];
  for (const combo of results) {
    const key = combo
      .map((s) => s.id)
      .sort((a, b) => a - b)
      .join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(combo);
    }
  }

  // Score & sort: prefer later start, earlier end, fewer gaps, more free days
  const combos: GeneratedCombo[] = unique.map((sections, i) => {
    const ms: Meeting[] = [];
    for (const s of sections) ms.push(...getSectionMeetings(s.slot, campus));
    const byDay = new Map<Day, Meeting[]>();
    for (const m of ms) (byDay.get(m.day) || byDay.set(m.day, []).get(m.day)!).push(m);
    const freeDays = DAYS.filter((d) => (byDay.get(d) || []).length === 0);
    let gapCount = 0;
    let earliestStart: number | null = null;
    let latestEnd: number | null = null;
    for (const day of DAYS) {
      const dm = (byDay.get(day) || []).sort((a, b) => a.start - b.start);
      if (dm.length === 0) continue;
      if (earliestStart === null || dm[0].start < earliestStart) earliestStart = dm[0].start;
      if (latestEnd === null || dm[dm.length - 1].end > latestEnd) latestEnd = dm[dm.length - 1].end;
      for (let k = 1; k < dm.length; k++) {
        if (dm[k].start - dm[k - 1].end > 10) gapCount++;
      }
    }
    const droppedCodes = codes.filter((c) => !sections.some((s) => s.code === c));
    const droppedPrioritySum = droppedCodes.reduce((s, c) => s + (priorityOf[c] || 5), 0);
    let score =
      droppedPrioritySum * 1000 + gapCount * 20 + freeDays.length * -5 + (ms.length ? 0 : 5000);
    void i;
    return {
      id: `combo-${i}-${Math.random().toString(36).slice(2, 7)}`,
      sections,
      droppedCodes,
      score,
      freeDays,
      gapCount,
      earliestStart,
      latestEnd,
      totalCredits: sections.reduce((s, e) => s + e.credits, 0),
    };
  });

  combos.sort((a, b) => a.score - b.score);
  return combos.slice(0, maxResults);
}

/** Format a compact description for stats */
export function rangeLabel(start: number | null, end: number | null): string {
  if (start === null || end === null) return "—";
  return `${fmtTime(start)} → ${fmtTime(end)}`;
}
