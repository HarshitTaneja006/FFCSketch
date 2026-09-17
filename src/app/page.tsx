"use client";

/**
 * FFCSketch — single page app (VIT Chennai exclusive)
 * Tabs: Timetable | Generator | Compare | Slot View
 * Course adding is a 2-stage flow embedded in the Timetable tab:
 *   stage 1 — pick a course · stage 2 — pick faculty/slot.
 * Shared timetables load via /?shared=<id>
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Sparkles, Grid3X3, Scale, Github } from "lucide-react";

import { useFFCS } from "@/store/ffcs";
import { CartEntry, CourseSection, GeneratedCombo, GridBlock, Day } from "@/lib/ffcs/types";
import { exportElementToPng, exportTimetablePng } from "@/lib/ffcs/export";
import { clashWithEntries, findClashes } from "@/lib/ffcs/timetable";
import { buildShareUrl, decodeShareToken } from "@/lib/ffcs/share";
import { toast } from "@/hooks/use-toast";

import AppHeader from "@/components/ffcs/AppHeader";
import TimetableGrid from "@/components/ffcs/TimetableGrid";
import CoursePicker from "@/components/ffcs/CoursePicker";
import CourseCart from "@/components/ffcs/CourseCart";
import StatsPanel from "@/components/ffcs/StatsPanel";
import Generator from "@/components/ffcs/Generator";
import { SlotView } from "@/components/ffcs/SlotView";
import { ShareDialog } from "@/components/ffcs/ShareDialog";
import { HelpSection } from "@/components/ffcs/HelpSection";
import { BlockPopover } from "@/components/ffcs/BlockPopover";
import CompareView from "@/components/ffcs/CompareView";
import ClashDoctor from "@/components/ffcs/ClashDoctor";
import { SlotFinderPopover } from "@/components/ffcs/SlotFinderPopover";
import { CustomCourseDialog } from "@/components/ffcs/CustomCourseDialog";

/** 🔗 Set this to the GitHub repository of your FFCSketch deployment. */
const GITHUB_URL = "https://github.com/your-username/ffcs-sketch";

type TabKey = "timetable" | "generator" | "compare" | "slots";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "timetable", label: "Timetable", icon: <CalendarDays size={15} className="inline mr-1" /> },
  { key: "generator", label: "Generator", icon: <Sparkles size={15} className="inline mr-1" /> },
  { key: "compare", label: "Compare", icon: <Scale size={15} className="inline mr-1" /> },
  { key: "slots", label: "Slot View", icon: <Grid3X3 size={15} className="inline mr-1" /> },
];

/**
 * Shared timetable banner — share links now carry the whole plan inside the
 * URL (…/?s=<token>), decoded client-side. No backend involved.
 */
interface SharedPayload {
  name: string;
  owner: string | null;
  entries: CourseSection[];
}

export default function Page() {
  const hydrated = useFFCS((s) => s.hydrated);
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const campus = useFFCS((s) => s.campus);
  const ownerName = useFFCS((s) => s.ownerName);
  const setOwnerName = useFFCS((s) => s.setOwnerName);
  const theme = useFFCS((s) => s.theme);

  const [tab, setTab] = useState<TabKey>("timetable");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharedBanner, setSharedBanner] = useState<SharedPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const [popoverBlock, setPopoverBlock] = useState<GridBlock | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [slotFinder, setSlotFinder] = useState<{ day: Day; periodIdx: number } | null>(null);
  const [slotFinderAnchor, setSlotFinderAnchor] = useState<{ x: number; y: number } | null>(null);
  /** seeds the CoursePicker search (from free-cell click): query + nonce to re-apply */
  const [seed, setSeed] = useState<{ q: string; n: number }>({ q: "", n: 0 });
  /** 👻 pencil-in preview from the Generator — dashed ghost blocks on the grid */
  const [peek, setPeek] = useState<{ sections: CourseSection[]; label: string } | null>(null);
  /** ✏️ custom-course dialog prefilled with a Slot View stack (null = closed) */
  const [customSlots, setCustomSlots] = useState<string[] | null>(null);
  const lastUndo = useFFCS((s) => s.lastUndo);
  const [undoVisible, setUndoVisible] = useState(false);
  const gridOrientation = useFFCS((s) => s.gridOrientation);
  const setGridOrientation = useFFCS((s) => s.setGridOrientation);

  /** PNG export target — whichever view is currently mounted (Timetable / Compare / Slot View) */
  const exportRef = useRef<HTMLDivElement | null>(null);
  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  /* ---------------- night sketch theme ---------------- */
  useEffect(() => {
    document.documentElement.classList.toggle("night-sketch", theme === "night");
  }, [theme]);

  /* ---------------- keyboard shortcuts: 1-4 tabs, Ctrl/Cmd+Z undo ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const res = useFFCS.getState().undoLast();
        if (res.ok) {
          toast({
            title: res.kind === "clear" ? "Table restored! ↩" : "Course added back! ↩",
          });
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0 && idx < TABS.length) {
        setTab(TABS[idx].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- undo chip visibility (auto-hide after 6s) ---------------- */
  useEffect(() => {
    if (!lastUndo) {
      setUndoVisible(false);
      return;
    }
    setUndoVisible(true);
    const t = setTimeout(() => setUndoVisible(false), 6000);
    return () => clearTimeout(t);
  }, [lastUndo]);

  const handleUndoClick = useCallback(() => {
    const res = useFFCS.getState().undoLast();
    if (res.ok) {
      toast({ title: res.kind === "clear" ? "Table restored! ↩" : "Course added back! ↩" });
    } else {
      toast({ title: res.reason || "Nothing to undo", variant: "destructive" });
    }
  }, []);

  /* ---------------- shared timetable loading (URL-embedded, client-side) ---------------- */
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("s");
    if (!token) return;
    const data = decodeShareToken(token);
    if (data) {
      setSharedBanner({ name: data.name, owner: data.owner, entries: data.entries });
    } else {
      toast({
        title: "Could not read that share link",
        description: "The link may be incomplete, mistyped, or from an older version of this app.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/");
    }
  }, [hydrated]);

  const acceptShared = useCallback(
    (intoNew: boolean) => {
      if (!sharedBanner) return;
      useFFCS
        .getState()
        .loadShared(
          sharedBanner.entries,
          intoNew,
          sharedBanner.owner
            ? `${sharedBanner.name} (by ${sharedBanner.owner})`
            : sharedBanner.name
        );
      setSharedBanner(null);
      setTab("timetable");
      window.history.replaceState({}, "", "/");
      toast({
        title: intoNew ? "Loaded into a new table!" : "Loaded into current table!",
        description: `${sharedBanner.entries.length} courses`,
      });
    },
    [sharedBanner]
  );

  /* ---------------- export PNG (works from Timetable, Compare AND Slot View) ---------------- */
  const handleExport = async () => {
    if (!exportRef.current) {
      toast({
        title: "Nothing to capture here",
        description: "Switch to the Timetable, Compare or Slot View tab — the PNG button exports the view you're on.",
      });
      return;
    }
    setExporting(true);
    try {
      const label =
        tab === "slots" ? "slot-view" : tab === "compare" ? "compare" : activeTable?.name || "timetable";
      const fname = `FFCSketch ${label}.png`.replace(/[^\w .()-]/g, "");
      if (tab === "timetable" && activeTable) {
        // composite sheet: weekly grid + full course list
        await exportTimetablePng(exportRef.current, fname, activeTable.entries, activeTable.name, campus);
      } else {
        await exportElementToPng(exportRef.current, fname);
      }
      toast({ title: "Timetable image downloaded 🎉" });
    } catch {
      toast({ title: "Export failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  /* ---------------- share (URL-embedded — no backend) ---------------- */
  const handleShareConfirm = (name: string) => {
    if (!activeTable || activeTable.entries.length === 0) {
      toast({ title: "Add some courses before sharing!" });
      return;
    }
    try {
      const url = buildShareUrl(activeTable.entries, name || activeTable.name, ownerName || null);
      setShareUrl(url);
      toast({ title: "Share link created!" });
    } catch {
      toast({ title: "Could not create share link", variant: "destructive" });
    }
  };

  /* ---------------- block click → popover (remove / swap) ---------------- */
  const handleBlockClick = useCallback((block: GridBlock, anchor: { x: number; y: number }) => {
    setPopoverBlock(block);
    setPopoverAnchor(anchor);
  }, []);

  /* ---------------- empty cell click → "what fits here?" slot finder ---------------- */
  const handleEmptyCellClick = useCallback(
    (day: Day, periodIdx: number, anchor: { x: number; y: number }) => {
      setSlotFinder({ day, periodIdx });
      setSlotFinderAnchor(anchor);
    },
    []
  );

  const handleSlotPick = useCallback((slot: string) => {
    setSeed((s) => ({ q: slot, n: s.n + 1 }));
    setTab("timetable");
    toast({
      title: `Searching sections in slot ${slot}…`,
      description: "Pick a course, then a faculty/slot that fits your free window!",
    });
  }, []);

  /** CourseCart "browse courses" → focus the 2-stage picker on this tab */
  const focusPicker = useCallback(() => {
    setTab("timetable");
    requestAnimationFrame(() => {
      const root = document.getElementById("course-picker");
      root?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      root?.querySelector<HTMLInputElement>("input")?.focus();
    });
  }, []);

  const handleBlockRemove = useCallback(
    (uid: string) => {
      const entry = activeTable?.entries.find((e) => e.uid === uid);
      useFFCS.getState().removeEntry(uid);
      setPopoverBlock(null);
      if (entry) toast({ title: `Removed ${entry.code}`, description: entry.faculty });
    },
    [activeTable]
  );

  const handleBlockSwap = useCallback(
    (removedUid: string, section: CourseSection) => {
      const state = useFFCS.getState();
      const entry = activeTable?.entries.find((e) => e.uid === removedUid);
      state.removeEntry(removedUid);
      const result = state.addSection(section);
      if (!result.ok) {
        // roll back
        if (entry) state.addSection(entry);
        toast({ title: result.reason || "Swap failed", variant: "destructive" });
        return;
      }
      toast({
        title: `Swapped to ${section.faculty}`,
        description: `${section.code} · ${section.slot}`,
      });
    },
    [activeTable]
  );

  const genPreview = useCallback((combo: GeneratedCombo) => {
    setPeek(null); // combo was applied — ghosts are real now
    setTab("timetable");
  }, []);

  /* ---------------- ghost peek from the Generator ---------------- */
  const handlePeek = useCallback((combo: GeneratedCombo | null) => {
    if (!combo) {
      setPeek(null);
      return;
    }
    setPeek({ sections: combo.sections, label: "generated combo" });
    setTab("timetable");
    toast({
      title: "👻 Peek mode — pencil-in preview",
      description: "Dashed blocks are the combo. Apply in the Generator to keep it.",
    });
  }, []);

  /* switching tables invalidates the peek preview */
  useEffect(() => {
    setPeek(null);
  }, [activeTableId]);

  const totalCredits = useMemo(
    () => (activeTable?.entries || []).reduce((s, e) => s + e.credits, 0),
    [activeTable?.entries]
  );

  const clashes = useMemo(
    () => findClashes(activeTable?.entries || [], campus),
    [activeTable?.entries, campus]
  );
  const clashCount = clashes.length;

  /** how many of the peeked combo's sections clash with the current table (honest preview feedback) */
  const peekClashCount = useMemo(() => {
    if (!peek || !activeTable) return 0;
    return peek.sections.filter(
      (s) => clashWithEntries(s, activeTable.entries, campus).length > 0
    ).length;
  }, [peek, activeTable, campus]);

  const ghostEntries: CartEntry[] | undefined = useMemo(
    () => peek?.sections.map((s) => ({ ...s, uid: `ghost-${s.id}` })),
    [peek]
  );

  /* slot code -> "CODE · faculty" labels, for the Slot View ✏ stamps */
  const usedSlots = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of activeTable?.entries || []) {
      const label = `${e.code} · ${e.faculty}`;
      for (const code of e.slot.split("+")) {
        const k = code.trim();
        if (!k) continue;
        (map[k] ||= []).push(label);
      }
    }
    return map;
  }, [activeTable?.entries]);

  return (
    <div className="ffcs-root">
      <AppHeader onExportImage={handleExport} onShare={() => setShareOpen(true)} />

      {/* shared banner */}
      {sharedBanner && (
        <div className="mx-auto px-3 pt-3" style={{ maxWidth: 1280 }}>
          <div
            className="flex flex-wrap items-center gap-2 p-3"
            style={{
              border: "2.5px dashed var(--good-strong)",
              borderRadius: "12px 6px 14px 8px",
              background: "var(--good-soft)",
            }}
          >
            <span style={{ fontWeight: "bold" }}>
              📬 Shared timetable: “{sharedBanner.name}”
              {sharedBanner.owner ? ` by ${sharedBanner.owner}` : ""} —{" "}
              {sharedBanner.entries.length} courses
            </span>
            <div className="flex-1" />
            <button className="chip clickable" onClick={() => acceptShared(true)} style={{ background: "var(--good)" }}>
              Load into NEW table
            </button>
            <button className="chip clickable" onClick={() => acceptShared(false)}>
              Replace current table
            </button>
            <button
              className="chip clickable"
              onClick={() => {
                setSharedBanner(null);
                window.history.replaceState({}, "", "/");
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full px-3 py-4" style={{ maxWidth: 1280 }}>
        {/* tabs */}
        <nav className="paper-tabs mb-4 no-print" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key}
              title={"shortcut " + (TABS.indexOf(t) + 1)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* TIMETABLE TAB — grid + 2-stage course picker + cart + stats.
            Horizontal orientation gets a FULL-WIDTH layout: the grid spans the
            entire page and the side panels stack below it (3-up on desktop),
            so the 12-period table never needs horizontal page scrolling.
            Vertical keeps the classic 2/3+1/3 split, and the side column is
            STICKY with its own internal scroll so the whole page is only as
            tall as the timetable itself — no endless scrolling. */}
        {tab === "timetable" && (
          <div
            className={
              gridOrientation === "horizontal"
                ? "grid gap-4 items-start"
                : "grid gap-4 lg:grid-cols-3 items-start"
            }
          >
            <section className={gridOrientation === "horizontal" ? "" : "lg:col-span-2"} aria-label="Weekly timetable">
              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                  <span className="sketch-underline">{activeTable?.name}</span>
                  {activeTable && activeTable.entries.length >= 2 && clashCount === 0 && (
                    <span className="stamp-clashfree" aria-hidden>
                      clash-free ✓
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* orientation toggle — vertical (classic) vs horizontal (rotated) */}
                  <div
                    role="group"
                    aria-label="Timetable layout direction"
                    className="flex"
                    style={{
                      border: "2px solid var(--ffcs-ink)",
                      borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                      overflow: "hidden",
                      background: "var(--card)",
                    }}
                  >
                    <button
                      onClick={() => setGridOrientation("vertical")}
                      aria-pressed={gridOrientation === "vertical"}
                      title="Classic layout — days across the top, time down the side"
                      className="ori-btn"
                      style={
                        gridOrientation === "vertical"
                          ? { background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700 }
                          : undefined
                      }
                    >
                      ⬍ vertical
                    </button>
                    <button
                      onClick={() => setGridOrientation("horizontal")}
                      aria-pressed={gridOrientation === "horizontal"}
                      title="Rotated layout — days down the side, time across the top"
                      className="ori-btn"
                      style={
                        gridOrientation === "horizontal"
                          ? { background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700 }
                          : undefined
                      }
                    >
                      ⬌ horizontal
                    </button>
                  </div>
                  <span className="chip" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                    {activeTable?.entries.length} courses · {totalCredits % 1 === 0 ? totalCredits : totalCredits.toFixed(1)} credits
                  </span>
                </div>
              </div>
              {clashCount > 0 && activeTable && (
                <ClashDoctor
                  entries={activeTable.entries}
                  campus={campus}
                  clashes={clashes}
                  onGoToGenerator={() => setTab("generator")}
                />
              )}
              {peek && (
                <div className="peek-banner mb-3" role="status">
                  <span aria-hidden className="peek-ghost">👻</span>
                  <span>
                    <strong>Peeking {peek.label}</strong> — {peek.sections.length} courses penciled in as dashed blocks.
                    {peekClashCount > 0 ? (
                      <span style={{ color: "var(--danger)", fontWeight: "bold" }}>
                        {" "}⚠ {peekClashCount} of them overlap your table!
                      </span>
                    ) : (
                      " They fit alongside your courses."
                    )}{" "}
                    Apply in the Generator to keep them.
                  </span>
                  <span className="flex-1" />
                  <button className="chip clickable" onClick={() => setTab("generator")}>
                    ← back to results
                  </button>
                  <button
                    className="chip clickable"
                    onClick={() => setPeek(null)}
                    aria-label="Exit peek mode"
                  >
                    ✕ exit peek
                  </button>
                </div>
              )}
              <div ref={exportRef} className="tt-sheet">
                {activeTable && (
                  <TimetableGrid
                    entries={activeTable.entries}
                    campus={campus}
                    onBlockClick={handleBlockClick}
                    onEmptyCellClick={handleEmptyCellClick}
                    ghostEntries={ghostEntries}
                  />
                )}
              </div>
            </section>

            <section
              className={
                gridOrientation === "horizontal"
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start"
                  : "grid gap-4 lg:sticky lg:top-[64px] lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:self-start lg:pr-1 side-scroll"
              }
              aria-label="Add courses, course list and insights"
            >
              {/* 2-stage course picker (was the Courses tab) */}
              <div
                className="p-3 taped corner-fold"
                style={{
                  border: "2.5px solid var(--ffcs-ink)",
                  borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
                  background: "var(--card)",
                  boxShadow: "3px 4px 0 var(--shadow-ink)",
                  marginTop: 8,
                }}
              >
                <CoursePicker initialQuery={seed.q} seedNonce={seed.n} />
              </div>
              <div
                className="p-3 taped taped-r corner-fold"
                style={{
                  border: "2.5px solid var(--ffcs-ink)",
                  borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
                  background: "var(--card)",
                  boxShadow: "3px 4px 0 var(--shadow-ink)",
                  marginTop: 8,
                }}
              >
                <CourseCart onGoToCourses={focusPicker} />
              </div>
              <div
                className="p-3 taped taped-r corner-fold"
                style={{
                  border: "2.5px solid var(--ffcs-ink)",
                  borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
                  background: "var(--card)",
                  boxShadow: "3px 4px 0 var(--shadow-ink)",
                  marginTop: 8,
                }}
              >
                <StatsPanel />
              </div>
            </section>
          </div>
        )}

        {/* GENERATOR TAB */}
        {tab === "generator" && (
          <section aria-label="Timetable generator">
            <Generator onPreview={genPreview} onPeek={handlePeek} />
          </section>
        )}

        {/* COMPARE TAB */}
        {tab === "compare" && (
          <section aria-label="Compare timetables">
            <div ref={exportRef}>
              <CompareView />
            </div>
          </section>
        )}

        {/* SLOT VIEW TAB — stack slots, spot conflicts (FFCS-inator style) */}
        {tab === "slots" && (
          <section
            aria-label="Slot view"
            style={{
              border: "2.5px solid var(--ffcs-ink)",
              borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
              background: "var(--card)",
              boxShadow: "3px 4px 0 var(--shadow-ink)",
              padding: 16,
            }}
            className="mb-4"
          >
            <SlotView
              usedSlots={usedSlots}
              exportRef={exportRef}
              onCreateCourse={(slots) => setCustomSlots(slots)}
            />
          </section>
        )}

        {/* HELP */}
        <HelpSection />
      </main>

      {/* FOOTER — sticky to bottom */}
      <footer className="ffcs-footer no-print" style={{ borderTop: "3px solid var(--ffcs-ink)", background: "var(--card)" }}>
        <div
          className="mx-auto px-3 py-3 flex flex-wrap items-center justify-between gap-2"
          style={{ maxWidth: 1280, fontSize: "0.82rem", color: "var(--muted-ink)" }}
        >
          <div>
            <strong>FFCSketch</strong> — an independent, student-made tool for{" "}
            <strong>VIT Chennai</strong>, inspired by{" "}
            <a href="https://github.com/vatz88/FFCSonTheGo" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              FFCSonTheGo
            </a>{" "}
            &{" "}
            <a href="https://github.com/CodeChefVIT/ffcs" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              FFCS-inator
            </a>
            . Not affiliated with VIT. Course data: VIT Chennai · Fall 2026-27 (via FFCSonTheGo).
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="your name (for shares)"
              aria-label="Your name for share links"
              style={{
                border: "2px solid var(--ffcs-ink)",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                padding: "3px 10px",
                fontFamily: "inherit",
                fontSize: "0.8rem",
                width: "min(170px, 100%)",
                background: "var(--input)",
              }}
            />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="chip clickable"
              title="View source on GitHub"
              aria-label="View source on GitHub"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: "0.78rem",
                background: "var(--input)",
              }}
            >
              <Github size={14} aria-hidden /> GitHub
            </a>
          </div>
        </div>
      </footer>

      <ShareDialog
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setShareUrl(null);
        }}
        shareUrl={shareUrl}
        onConfirm={handleShareConfirm}
        loading={false}
        tableName={activeTable?.name || "My Timetable"}
        entries={activeTable?.entries || []}
        campus={campus}
      />

      {/* custom course dialog — shared by the picker AND the Slot View stack */}
      <CustomCourseDialog
        open={customSlots !== null}
        onClose={() => setCustomSlots(null)}
        initialSlots={customSlots ?? undefined}
      />

      <BlockPopover
        block={popoverBlock}
        anchor={popoverAnchor}
        entries={activeTable?.entries || []}
        campus={campus}
        onClose={() => setPopoverBlock(null)}
        onRemove={handleBlockRemove}
        onSwap={handleBlockSwap}
      />

      <SlotFinderPopover
        cell={slotFinder}
        anchor={slotFinderAnchor}
        campus={campus}
        onClose={() => setSlotFinder(null)}
        onPick={handleSlotPick}
      />

      {/* floating undo chip */}
      {undoVisible && lastUndo && (
        <button
          className="undo-chip"
          onClick={handleUndoClick}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden>↩</span>{" "}
          {lastUndo.kind === "clear"
            ? `Cleared “${lastUndo.tableName}” (${lastUndo.entries.length} courses)`
            : `Removed ${lastUndo.entries[0]?.code}`}{" "}
          <strong>Undo</strong>
        </button>
      )}

      {exporting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(20,17,24,0.45)",
            color: "var(--card)",
            fontSize: "1.2rem",
          }}
        >
          drawing your timetable… ✏️
        </div>
      )}
    </div>
  );
}
