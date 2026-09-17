"use client";

/**
 * CoursePicker — 2-stage course adding, embedded in the Timetable tab.
 *
 *   Stage 1  →  student picks a COURSE (search across distinct course codes)
 *   Stage 2  →  then picks the FACULTY / SLOT section for that course
 *
 * Also hosts the "custom course" entry point (pencil button in the header).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Clock, FileSpreadsheet, Loader2, MapPin, Pencil, Plus, Repeat2, Search, Sparkles, X } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import { CartEntry, CourseSection, CourseSummary, CourseType, COURSE_TYPE_LABELS } from "@/lib/ffcs/types";
import { clashWithEntries } from "@/lib/ffcs/timetable";
import { allLabSlots, allTheorySlots, getSectionMeetings, meetingLabel, parseSlotCodes } from "@/lib/ffcs/slots";
import { ALL_SECTIONS, getSectionsByCode, queryGroupedCourses } from "@/lib/ffcs/courseData";
import { findEmbeddedPartners, partnerTypeOf } from "@/lib/ffcs/embedded";
import { toast } from "@/hooks/use-toast";
import { CustomCourseDialog } from "./CustomCourseDialog";
import { XlsxImportDialog } from "./XlsxImportDialog";

const PAGE_SIZE = 25;

interface Props {
  /** pre-filled search (slot code from a free-cell click, or course code) */
  initialQuery?: string;
  /** bump to re-apply initialQuery (e.g. clicking another free cell) */
  seedNonce?: number;
}

export default function CoursePicker({ initialQuery = "", seedNonce = 0 }: Props) {
  const campus = useFFCS((s) => s.campus);
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const addSectionWithPair = useFFCS((s) => s.addSectionWithPair);
  const wishlist = useFFCS((s) => s.wishlist);
  const setWishlist = useFFCS((s) => s.setWishlist);

  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState<string>("");
  const [credits, setCredits] = useState<string>("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /** stage 2 */
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [secFilter, setSecFilter] = useState("");

  const [customOpen, setCustomOpen] = useState(false);
  const [xlsxOpen, setXlsxOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  /** every known slot code (theory + lab) — a search query that exactly
   *  matches one of these flips the picker into SLOT MODE: a flat list of
   *  every section that meets in that slot. Substring search used to match
   *  "A1" inside "TA1"/"A1+A2" etc., so slot clicks showed wrong courses. */
  const SLOT_CODE_SET = useMemo(() => new Set([...allTheorySlots(), ...allLabSlots()]), []);

  const slotQuery = picked ? "" : q.trim().toUpperCase();
  const isSlotQuery = SLOT_CODE_SET.has(slotQuery);

  /** all sections whose slot string contains the exact slot code (respects the
   *  type + credits filters), grouped by course code for display */
  const slotSections = useMemo(() => {
    if (!isSlotQuery) return [];
    const types = type
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean) as CourseType[];
    let items = ALL_SECTIONS.filter((c) => parseSlotCodes(c.slot).includes(slotQuery));
    if (types.length > 0) items = items.filter((c) => types.includes(c.type));
    if (credits) items = items.filter((c) => String(c.credits) === credits);
    return [...items].sort(
      (a, b) => a.code.localeCompare(b.code) || a.faculty.localeCompare(b.faculty)
    );
  }, [isSlotQuery, slotQuery, type, credits]);

  /** when the slot meets, e.g. "Mon 8:00 AM-8:50 AM · Wed 8:55 AM-9:45 AM" */
  const slotTimeLabel = useMemo(() => {
    if (!isSlotQuery) return "";
    return getSectionMeetings(slotQuery, campus).map(meetingLabel).join(" · ");
  }, [isSlotQuery, slotQuery, campus]);

  const slotGroups = useMemo(() => {
    const map = new Map<string, CourseSection[]>();
    for (const s of slotSections) {
      const arr = map.get(s.code) || [];
      arr.push(s);
      map.set(s.code, arr);
    }
    return [...map.entries()];
  }, [slotSections]);

  /** key `${code}|${type}` -> the entry already in the active table (if any) —
   *  derived, not state: recomputes whenever the table changes */
  const inTable = useMemo(() => {
    const map = new Map<string, CartEntry>();
    if (activeTable) {
      for (const e of activeTable.entries) map.set(`${e.code}|${e.type}`, e);
    }
    return map;
  }, [activeTable, activeTable?.entries.length]);

  /* -------- external seed (free-cell click / slot view) --------
     adjust state during render when the seed nonce changes (React-endorsed
     pattern — avoids a cascading effect render) */
  const [lastSeed, setLastSeed] = useState(seedNonce);
  if (seedNonce !== lastSeed) {
    setLastSeed(seedNonce);
    setPicked(null);
    setQ(initialQuery);
  }

  useEffect(() => {
    if (seedNonce > 0) {
      const raf = requestAnimationFrame(() =>
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [seedNonce]);

  /* -------- stage 1: grouped course search (debounced; local dataset) -------- */
  const fetchCourses = useCallback(
    (p: number) => {
      try {
        const data = queryGroupedCourses({
          q: q.trim(),
          type,
          credits,
          sort: sort as "code" | "title" | "sections" | "credits",
          page: p,
          limit: PAGE_SIZE,
        });
        setCourses(data.courses);
        setTotal(data.total);
        setPage(data.page);
        setLoading(false);
      } catch {
        toast({ title: "Could not load courses", variant: "destructive" });
        setLoading(false);
      }
    },
    [q, type, credits, sort]
  );

  useEffect(() => {
    if (picked || isSlotQuery) return; // stage 2 / slot mode — keep the course list as-is
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCourses(1), 260);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, type, credits, sort, fetchCourses, picked, isSlotQuery]);

  /* -------- stage 2: all sections of the picked course (local dataset) -------- */
  const openCourse = useCallback((c: CourseSummary) => {
    setPicked(c);
    setSecFilter("");
    setSections(getSectionsByCode(c.code));
  }, []);

  /* track which course+types are already in the active table — derived above */

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleAdd = (s: CourseSection) => {
    const result = addSectionWithPair(s);
    if (!result.ok) {
      toast({ title: result.reason, variant: "destructive" });
      return;
    }
    const clashing = clashWithEntries(s, activeTable?.entries || [], campus);
    // embedded course: the same-faculty partner half is added automatically
    if (result.paired) {
      const labClash = (result.pairedClashCount || 0) > 0;
      toast({
        title: `Added ${s.code} embedded pair ✓`,
        description:
          `${s.type} ${s.slot} + ${result.paired.type} ${result.paired.slot} · ${s.faculty}` +
          (labClash ? " — ⚠ the embedded half clashes with your table" : ""),
        variant: labClash || clashing.length > 0 ? "destructive" : "default",
      });
      return;
    }
    const needLabel = s.type === "ETH" ? "lab" : "theory";
    toast({
      title: `Added ${s.code} (${s.type})`,
      description: result.partnerMissing
        ? `⚠ No embedded ${needLabel} by ${s.faculty} in the course list — the pair stays incomplete.`
        : clashing.length > 0
          ? "⚠ This section clashes with your current selection!"
          : `${s.slot} · ${s.faculty}`,
      variant: result.partnerMissing || clashing.length > 0 ? "destructive" : "default",
    });
  };

  /** switch the in-table section of the same course+type to THIS section (one-click swap) */
  const handleSwap = (s: CourseSection, existing: CartEntry) => {
    if (!activeTable) return;
    if (existing.slot === s.slot && existing.faculty === s.faculty) {
      toast({ title: `${s.code} · ${s.slot} is already your selected section` });
      return;
    }
    const remaining = activeTable.entries.filter((e) => e.uid !== existing.uid);
    const clashing = clashWithEntries(s, remaining, campus);
    const res = useFFCS.getState().swapSection(existing.uid, s);
    if (!res.ok) {
      toast({ title: res.reason || "Could not switch section", variant: "destructive" });
      return;
    }
    // embedded pair sync: if the swapped half changed faculty and the other half
    // in the table no longer matches, switch it to a same-faculty section too
    let pairNote = "";
    const needType = partnerTypeOf(s.type);
    const tableNow = useFFCS.getState().activeTable();
    const partnerHalf = tableNow?.entries.find(
      (e) => e.code === s.code && e.type === needType
    );
    if (needType && partnerHalf && partnerHalf.faculty.trim().toUpperCase() !== s.faculty.trim().toUpperCase()) {
      const fixes = findEmbeddedPartners(s);
      const others = (tableNow?.entries || []).filter((e) => e.uid !== partnerHalf.uid);
      const pick =
        fixes.find((f) => clashWithEntries(f, others, campus).length === 0) || fixes[0];
      const res2 = pick ? useFFCS.getState().swapSection(partnerHalf.uid, pick) : null;
      const needLabel = needType === "ELA" ? "lab" : "theory";
      if (res2 && res2.ok) {
        pairNote = ` · also switched the embedded ${needLabel} to ${pick.slot} (${pick.faculty})`;
      } else {
        pairNote = ` · ⚠ embedded ${needLabel} is now by ${partnerHalf.faculty} — not the same faculty`;
      }
    }
    toast({
      title: `Switched ${s.code} → ${s.slot}`,
      description:
        clashing.length > 0
          ? `⚠ clashes with ${clashing.length} course${clashing.length > 1 ? "s" : ""} — Ctrl+Z restores the old plan${pairNote}`
          : `${s.faculty} · replaced ${existing.slot} · ${existing.faculty} — Ctrl+Z restores${pairNote}`,
      variant: clashing.length > 0 ? "destructive" : "default",
    });
  };

  /** send a course to the Generator wishlist (by code, deduped) */
  const handleWishlist = (s: CourseSection) => {
    const code = s.code.toUpperCase();
    if (wishlist.some((w) => w.code === code)) {
      toast({ title: `${code} is already in the Generator wishlist ✨` });
      return;
    }
    setWishlist([...wishlist, { code, priority: wishlist.length + 1, title: s.title }]);
    toast({
      title: `${code} sent to Generator ✨`,
      description: "Rank it in the Generator to auto-build a clash-free timetable",
    });
  };

  const goToPage = (p: number) => {
    fetchCourses(p);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredSections = sections.filter((s) => {
    if (!secFilter.trim()) return true;
    const f = secFilter.trim().toLowerCase();
    return (
      s.faculty.toLowerCase().includes(f) ||
      s.slot.toLowerCase().includes(f) ||
      s.type.toLowerCase().includes(f)
    );
  });

  const cardStyle: React.CSSProperties = {
    border: "2px solid var(--ffcs-ink)",
    borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
    background: "var(--card)",
    boxShadow: "2px 3px 0 var(--shadow-ink)",
  };

  /** one section card — shared by stage 2 AND slot mode (showCourse adds the
   *  code/title row for flat lists where several courses are mixed) */
  const renderSectionCard = (s: CourseSection, showCourse: boolean) => {
    const existing = inTable.get(`${s.code}|${s.type}`);
    const added = !!existing;
    const isThisOne = added && existing!.slot === s.slot && existing!.faculty === s.faculty;
    const clashing = clashWithEntries(s, activeTable?.entries || [], campus).filter(
      (uid) => uid !== existing?.uid
    );
    const times = getSectionMeetings(s.slot, campus)
      .slice(0, 3)
      .map(meetingLabel)
      .join(" · ");
    return (
      <div key={s.id} className="p-3.5" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showCourse && (
              <div className="truncate" style={{ fontSize: "0.86rem", marginBottom: 3 }}>
                <strong>{s.code}</strong>{" "}
                <span style={{ color: "var(--muted-ink)", fontSize: "0.78rem" }}>{s.title}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: "0.84rem" }}>
              <strong>👤 {s.faculty}</strong>
              <span
                className="chip"
                style={{ fontSize: "0.66rem", background: "var(--accent)", color: "var(--on-accent)" }}
                title="Slot string"
              >
                🕒 {s.slot}
              </span>
              <span className="chip" style={{ fontSize: "0.66rem" }}>
                {COURSE_TYPE_LABELS[s.type as CourseType] || s.type}
              </span>
              <span className="chip" style={{ fontSize: "0.66rem" }}>{s.credits} cr</span>
              {s.venue && (
                <span
                  className="chip"
                  style={{ fontSize: "0.66rem", borderColor: "var(--cell-border)" }}
                  title="Venue / room"
                >
                  <MapPin size={10} className="inline mr-0.5" style={{ verticalAlign: "-1px" }} />
                  {s.venue}
                </span>
              )}
              {(s.type === "ETH" || s.type === "ELA") && (() => {
                const partners = findEmbeddedPartners(s);
                const needLabel = s.type === "ETH" ? "lab" : "theory";
                return partners.length > 0 ? (
                  <span
                    className="chip"
                    style={{ fontSize: "0.66rem", borderColor: "var(--good-strong)", color: "var(--good-strong)" }}
                    title={`Embedded pair: the ${needLabel} (${partners.map((p) => p.slot).slice(0, 3).join(", ")}) by ${s.faculty} is auto-added with this section`}
                  >
                    🔗 +{partners[0].type} {partners[0].slot}{partners.length > 1 ? ` +${partners.length - 1} more` : ""}
                  </span>
                ) : (
                  <span
                    className="chip"
                    style={{ fontSize: "0.66rem", borderColor: "var(--danger)", color: "var(--danger)" }}
                    title={`No embedded ${needLabel} by ${s.faculty} in the course list — this half can't be paired`}
                  >
                    ⚠ no same-faculty {needLabel}
                  </span>
                );
            })()}
            </div>
            {times && (
              <div style={{ fontSize: "0.74rem", color: "var(--muted-ink)", marginTop: 4 }}>
                {times}
                {getSectionMeetings(s.slot, campus).length > 3 && " …"}
              </div>
            )}
            {added && (
              <div
                className="in-table-stamp"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                  color: isThisOne ? "var(--good-strong)" : "var(--muted-ink)",
                  border: `1.5px dashed ${isThisOne ? "var(--good-strong)" : "var(--cell-border)"}`,
                  borderRadius: "8px 4px 10px 5px",
                  padding: "2px 8px",
                  background: isThisOne ? "var(--good-soft)" : "var(--flex-bg)",
                }}
                title={
                  isThisOne
                    ? "This exact section is in the active table"
                    : `A different section is in the table: ${existing!.slot} · ${existing!.faculty}`
                }
              >
                {isThisOne ? (
                  <>
                    <Check size={12} aria-hidden /> your section
                  </>
                ) : (
                  <>in table: {existing!.slot} · {existing!.faculty}</>
                )}
              </div>
            )}
            {clashing.length > 0 && !isThisOne && (
              <div style={{ fontSize: "0.72rem", color: "var(--danger)", fontWeight: "bold", marginTop: 3 }}>
                ⚠ clashes with {clashing.length} course{clashing.length > 1 ? "s" : ""} in table
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {added && !isThisOne ? (
              <button
                className="prio-btn swap-btn"
                onClick={() => handleSwap(s, existing!)}
                title={`Switch the table to this section (replaces ${existing!.slot} · ${existing!.faculty})`}
                aria-label={`Switch ${s.code} to section ${s.slot}`}
                style={{ minWidth: 34, height: 34, background: "var(--accent)", color: "var(--on-accent)" }}
              >
                <Repeat2 size={16} />
              </button>
            ) : (
              <button
                className="prio-btn"
                onClick={() => handleAdd(s)}
                disabled={added}
                title={added ? "Already in the table — use ⇄ on other sections" : "Add to table"}
                aria-label={`Add ${s.code} section ${s.slot}`}
                style={{
                  minWidth: 34,
                  height: 34,
                  opacity: added ? 0.45 : 1,
                  background: added ? "var(--tt6)" : "var(--accent)",
                  color: added ? "var(--ffcs-ink)" : "var(--on-accent)",
                }}
              >
                <Plus size={16} />
              </button>
            )}
            <button
              className="prio-btn"
              onClick={() => handleWishlist(s)}
              title="Send to Generator wishlist (auto-build a clash-free plan)"
              aria-label={`Add ${s.code} to generator wishlist`}
              style={{ minWidth: 34, height: 34, background: "var(--card)" }}
            >
              <Sparkles size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} id="course-picker">
      {/* header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="ffcs-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {picked ? (
            <>
              <button
                className="prio-btn"
                onClick={() => setPicked(null)}
                title="Back to course list"
                aria-label="Back to course list"
                style={{ width: 22, height: 22, minWidth: 22 }}
              >
                ←
              </button>
              <span>
                <strong>{picked.code}</strong> — pick faculty &amp; slot
              </span>
            </>
          ) : (
            <>
              <span className="chip" style={{ fontSize: "0.66rem", padding: "1px 6px" }}>1</span>
              pick a course
              <ChevronRight size={12} aria-hidden />
              <span className="chip" style={{ fontSize: "0.66rem", padding: "1px 6px" }}>2</span>
              pick faculty / slot
            </>
          )}
        </div>
        <div className="flex" style={{ flexShrink: 0 }}>
          <button
            className="prio-btn wide"
            onClick={() => setXlsxOpen(true)}
            title="Import courses from an .xlsx / .csv spreadsheet (CODE, TITLE, TYPE, CREDITS, FACULTY, SLOT)"
            aria-label="Import courses from a spreadsheet"
            style={{ fontSize: "0.75rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            <FileSpreadsheet size={12} />
            <span>xlsx</span>
          </button>
          <button
            className="prio-btn wide"
            onClick={() => setCustomOpen(true)}
            title="Create a custom course (project, club, self-study…)"
            aria-label="Create a custom course"
            style={{ fontSize: "0.75rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            <Pencil size={12} />
            <span>custom course</span>
          </button>
        </div>
      </div>

      {/* search row */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 11, opacity: 0.5 }} />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (picked) setPicked(null);
            }}
            placeholder={
              picked
                ? "Search to switch course…"
                : isSlotQuery
                  ? `Slot ${slotQuery} — exact matches · tap ✕ to clear`
                  : "Search course code, title or SLOT… e.g. CSE2001, DSA, A1"
            }
            aria-label="Search courses"
            style={{
              width: "100%",
              border: "2px solid var(--ffcs-ink)",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              padding: "10px 36px 10px 34px",
              fontFamily: "inherit",
              background: "var(--input)",
              fontSize: "0.92rem",
            }}
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 10, top: 10, opacity: 0.6 }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        {!picked && (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: 8,
              padding: "9px 10px",
              fontFamily: "inherit",
              background: "var(--input)",
              fontSize: "0.84rem",
            }}
          >
            <option value="">All types</option>
            {Object.entries(COURSE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        {!picked && !isSlotQuery && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort courses"
            style={{
              border: "2px solid var(--ffcs-ink)",
              borderRadius: 8,
              padding: "9px 10px",
              fontFamily: "inherit",
              background: "var(--input)",
              fontSize: "0.84rem",
            }}
          >
            <option value="code">Sort: Code</option>
            <option value="title">Sort: Title</option>
            <option value="sections">Sort: Most sections</option>
          </select>
        )}
      </div>

      <div ref={listTopRef} />

      {/* ---------------- STAGE 2: sections of the picked course ---------------- */}
      {picked ? (
        <div className="ffcs-scroll" style={{ maxHeight: 480, overflowY: "auto" }}>
          <div
            className="p-2.5 mb-3"
            style={{
              border: "2px dashed var(--cell-border)",
              borderRadius: 8,
              background: "var(--flex-bg)",
              fontSize: "0.82rem",
              lineHeight: 1.5,
            }}
          >
            <strong>{picked.title}</strong>
            <span style={{ color: "var(--muted-ink)" }}>
              {" "}· {picked.credits} cr · {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
              {picked.facultyCount} faculty
            </span>
          </div>
          <input
            value={secFilter}
            onChange={(e) => setSecFilter(e.target.value)}
            placeholder="Filter by faculty, slot or type… e.g. A1, RAJ"
            aria-label="Filter sections"
            style={{
              width: "100%",
              border: "2px solid var(--cell-border)",
              borderRadius: 8,
              padding: "9px 12px",
              fontFamily: "inherit",
              background: "var(--input)",
              fontSize: "0.84rem",
              marginBottom: 10,
            }}
          />
          {sectionsLoading ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: "var(--label-ink)" }}>
              <Loader2 className="animate-spin" size={18} /> loading sections…
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="py-6 text-center" style={{ color: "var(--label-ink)", fontSize: "0.88rem" }}>
              No sections match that filter.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredSections.map((s) => renderSectionCard(s, false))}
            </div>
          )}
        </div>
      ) : isSlotQuery ? (
        /* ---------------- SLOT MODE: every section in this exact slot ---------------- */
        <div className="ffcs-scroll" style={{ maxHeight: 480, overflowY: "auto", paddingRight: 2 }}>
          <div
            className="p-2.5 mb-3 flex items-start gap-2"
            style={{
              border: "2px dashed var(--accent)",
              borderRadius: 8,
              background: "var(--flex-bg)",
              fontSize: "0.82rem",
              lineHeight: 1.5,
            }}
          >
            <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div className="min-w-0">
              <div>
                <strong>Slot {slotQuery}</strong> — {slotSections.length} section
                {slotSections.length === 1 ? "" : "s"} meet{slotSections.length === 1 ? "s" : ""} here
              </div>
              {slotTimeLabel && (
                <div style={{ color: "var(--muted-ink)", fontSize: "0.76rem" }}>{slotTimeLabel}</div>
              )}
            </div>
            <button
              onClick={() => setQ("")}
              className="prio-btn"
              aria-label="Clear slot search"
              title="Clear slot search"
              style={{ marginLeft: "auto", width: 24, height: 24, minWidth: 24, flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
          {slotSections.length === 0 ? (
            <div className="py-6 text-center" style={{ color: "var(--label-ink)", fontSize: "0.88rem" }}>
              No sections are scheduled in slot {slotQuery}
              {type || credits ? " with the current filters" : ""}.
            </div>
          ) : (
            slotGroups.map(([code, secs]) => (
              <div key={code} className="mb-4">
                <div className="ffcs-label" style={{ marginBottom: 6, fontSize: "0.76rem" }}>
                  {code} · {secs.length} section{secs.length === 1 ? "" : "s"}{" "}
                  <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                    — {secs[0].title}
                  </span>
                </div>
                <div className="grid gap-3">{secs.map((s) => renderSectionCard(s, false))}</div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ---------------- STAGE 1: course list ---------------- */
        <>
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="ffcs-label" title={activeTable ? `Adding to "${activeTable.name}"` : undefined}>
              {loading ? "Searching…" : `${total} course${total === 1 ? "" : "s"} found`}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--label-ink)", whiteSpace: "nowrap" }}>
              Page {page}/{totalPages}
            </span>
          </div>
          <div className="ffcs-scroll" style={{ maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
            {loading && courses.length === 0 ? (
              <div className="flex items-center justify-center py-8 gap-2" style={{ color: "var(--label-ink)" }}>
                <Loader2 className="animate-spin" size={18} /> loading courses…
              </div>
            ) : courses.length === 0 ? (
              <div className="py-8 text-center" style={{ color: "var(--label-ink)", fontSize: "0.88rem" }}>
                <span className="empty-doodle" aria-hidden>🔍</span>
                <br />
                No courses match your search.
                <span style={{ display: "block", marginTop: 6, fontSize: "0.78rem" }}>
                  Teaching a project or club instead? Create a{" "}
                  <button
                    onClick={() => setCustomOpen(true)}
                    style={{
                      textDecoration: "underline",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                      color: "var(--accent-strong, var(--accent))",
                      fontWeight: "bold",
                    }}
                  >
                    custom course
                  </button>
                  .
                </span>
              </div>
            ) : (
              <div className="grid gap-3">
                {courses.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => openCourse(c)}
                    className="p-3.5 text-left"
                    style={{ ...cardStyle, cursor: "pointer", transition: "transform 0.1s, filter 0.12s" }}
                    onMouseDown={(e) => e.currentTarget.classList.add("is-pressed")}
                    onMouseUp={(e) => e.currentTarget.classList.remove("is-pressed")}
                    onMouseLeave={(e) => e.currentTarget.classList.remove("is-pressed")}
                    title={`Pick ${c.code} — then choose a faculty/slot`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong style={{ fontSize: "0.92rem" }}>{c.code}</strong>
                          <span className="chip" style={{ fontSize: "0.66rem" }}>{c.credits} cr</span>
                          {c.types.map((t) => (
                            <span key={t} className="chip" style={{ fontSize: "0.64rem" }}>
                              {COURSE_TYPE_LABELS[t as CourseType] || t}
                            </span>
                          ))}
                        </div>
                        <div
                          className="truncate mt-1"
                          title={c.title}
                          style={{ fontSize: "0.84rem" }}
                        >
                          {c.title}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted-ink)", marginTop: 2 }}>
                          {c.sectionCount} section{c.sectionCount === 1 ? "" : "s"} ·{" "}
                          {c.faculties.join(", ")}
                          {c.facultyCount > c.faculties.length ? ` +${c.facultyCount - c.faculties.length} more` : ""}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        style={{ color: "var(--accent)", flexShrink: 0, fontWeight: "bold" }}
                      >
                        →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                className="prio-btn"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                style={{ opacity: page <= 1 ? 0.4 : 1 }}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span style={{ fontSize: "0.82rem" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="prio-btn"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                style={{ opacity: page >= totalPages ? 0.4 : 1 }}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}

      <CustomCourseDialog open={customOpen} onClose={() => setCustomOpen(false)} />
      <XlsxImportDialog open={xlsxOpen} onClose={() => setXlsxOpen(false)} />
    </div>
  );
}
