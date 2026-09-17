"use client";

/**
 * Generator — priority based clash-free timetable generation (FFCS-inator style).
 * Add desired courses (by code), set priorities, generate combos, apply to table.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Cpu, Download, Eye, Loader2, Lock, LockOpen, Sparkles, Wand2, X } from "lucide-react";
import { useFFCS } from "@/store/ffcs";
import {
  CourseSection,
  DAY_LABELS,
  DAYS,
  GeneratedCombo,
} from "@/lib/ffcs/types";
import { clashWithEntries, generateTimetables } from "@/lib/ffcs/timetable";
import { fmtTime, getSectionMeetings } from "@/lib/ffcs/slots";
import { getSectionsByCode } from "@/lib/ffcs/courseData";
import { toast } from "@/hooks/use-toast";

export default function Generator({
  onPreview,
  onPeek,
}: {
  onPreview: (combo: GeneratedCombo) => void;
  onPeek: (combo: GeneratedCombo | null) => void;
}) {
  const campus = useFFCS((s) => s.campus);
  const wishlist = useFFCS((s) => s.wishlist);
  const setWishlist = useFFCS((s) => s.setWishlist);
  const hydrated = useFFCS((s) => s.hydrated);
  const tables = useFFCS((s) => s.tables);
  const activeTableId = useFFCS((s) => s.activeTableId);
  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];
  const [codeInput, setCodeInput] = useState("");
  const [sectionsByCode, setSectionsByCode] = useState<Record<string, CourseSection[]>>({});
  const [generating, setGenerating] = useState(false);
  /** theory-window hard filters that constrain which sections combos may use */
  const [morningTheory, setMorningTheory] = useState(false);
  const [eveningTheory, setEveningTheory] = useState(false);
  const prefs = useMemo(
    () => ({ morningTheory, eveningTheory }),
    [morningTheory, eveningTheory]
  );

  const desired = wishlist;

  /** restore cached results if the wishlist hasn't changed since they were computed (peek → back) */
  const lastCombos = useFFCS((s) => s.lastCombos);
  const lastCombosSig = useFFCS((s) => s.lastCombosSig);
  const wlSig = useMemo(
    () => desired.map((d) => `${d.code}${d.lockedSectionId ?? ""}`).join(","),
    [desired]
  );
  const [combos, setCombos] = useState<GeneratedCombo[] | null>(
    lastCombos && lastCombosSig === wlSig ? lastCombos : null
  );

  // restore section lists for persisted wishlist after reload (local dataset — instant)
  useEffect(() => {
    if (!hydrated || wishlist.length === 0) return;
    const missing = wishlist.filter((w) => !sectionsByCode[w.code]);
    if (missing.length === 0) return;
    const next: Record<string, CourseSection[]> = {};
    for (const w of missing) {
      const secs = getSectionsByCode(w.code);
      if (secs.length > 0) next[w.code] = secs;
    }
    if (Object.keys(next).length > 0) {
      setSectionsByCode((prev) => ({ ...prev, ...next }));
    }
  }, [hydrated, wishlist, sectionsByCode]);

  const addCourse = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code) return;
      if (desired.some((d) => d.code === code)) {
        toast({ title: `${code} already added` });
        return;
      }
      const sections = getSectionsByCode(code);
      if (sections.length === 0) {
        toast({ title: `No sections found for "${code}"`, variant: "destructive" });
        return;
      }
      setSectionsByCode((prev) => ({ ...prev, [code]: sections }));
      setWishlist([...desired, { code, priority: desired.length + 1, title: sections[0].title }]);
      setCodeInput("");
      setCombos(null);
    },
    [desired]
  );

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...desired];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setWishlist(next.map((d, i) => ({ ...d, priority: i + 1 })));
    setCombos(null);
  };

  const removeCourse = (code: string) => {
    setWishlist(desired.filter((d) => d.code !== code).map((d, i) => ({ ...d, priority: i + 1 })));
    setCombos(null);
  };

  /** which wishlist row has its section-picker open */
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const lockSection = (code: string, section: CourseSection | null) => {
    setWishlist(
      desired.map((d) =>
        d.code === code
          ? {
              ...d,
              lockedSectionId: section ? section.id : null,
              lockedLabel: section ? `${section.slot} · ${section.faculty}` : undefined,
            }
          : d
      )
    );
    setPickerFor(null);
    setCombos(null);
    if (section) {
      toast({ title: `Pinned ${code}`, description: `${section.slot} · ${section.faculty} — every combo will include it` });
    } else {
      toast({ title: `Unpinned ${code}`, description: "All sections are back in the pool" });
    }
  };

  const computeCombos = () =>
    generateTimetables(
      desired.map(({ code, priority, lockedSectionId }) => ({ code, priority, lockedSectionId })),
      sectionsByCode,
      campus,
      { maxResults: 60, allowDrop: 2, prefs }
    );

  const runGenerate = () => {
    if (desired.length === 0) {
      toast({ title: "Add at least one course first" });
      return;
    }
    setGenerating(true);
    // let the UI paint the spinner before heavy sync compute
    setTimeout(() => {
      try {
        const result = computeCombos();
        setCombos(result);
        useFFCS.getState().setLastCombos(result, wlSig);
        const lockedCount = desired.filter((d) => d.lockedSectionId != null).length;
        if (result.length === 0) {
          toast({
            title: "No clash-free combination found",
            description:
              lockedCount > 0
                ? "Your pinned sections may conflict — try unpinning one."
                : "Try different slots or fewer courses.",
            variant: "destructive",
          });
        } else {
          toast({
            title: `Found ${result.length} clash-free combination${result.length > 1 ? "s" : ""}!`,
            description: lockedCount > 0 ? `All include your ${lockedCount} pinned section${lockedCount > 1 ? "s" : ""} 🔒` : undefined,
          });
        }
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  /** roll the dice: generate silently and apply a random clash-free combo */
  const [surprising, setSurprising] = useState(false);
  const surpriseMe = () => {
    if (desired.length === 0) {
      toast({ title: "Add at least one course first" });
      return;
    }
    setSurprising(true);
    setTimeout(() => {
      try {
        const result = computeCombos();
        setCombos(result);
        useFFCS.getState().setLastCombos(result, wlSig);
        if (result.length === 0) {
          toast({
            title: "The dice found nothing 🎲",
            description: "No clash-free combination exists — try other slots.",
            variant: "destructive",
          });
          return;
        }
        const pick = result[Math.floor(Math.random() * result.length)];
        // let the previous table contents come back via Ctrl/Cmd+Z
        const prev = useFFCS.getState().activeTable();
        if (prev && prev.entries.length > 0) {
          useFFCS.getState().snapshotUndo("clear", prev.id, prev.name, prev.entries);
        }
        applyCombo(pick, true);
        toast({
          title: `Rolled combo #${result.indexOf(pick) + 1} of ${result.length} 🎲`,
          description: `${pick.sections.length} courses · ${pick.totalCredits} credits — surprise!`,
        });
      } finally {
        setSurprising(false);
      }
    }, 30);
  };

  const applyCombo = (combo: GeneratedCombo, silent = false) => {
    const state = useFFCS.getState();
    // snapshot the pre-apply table so Ctrl/Cmd+Z can restore it (dice already did this)
    const prev = state.activeTable();
    if (prev && prev.entries.length > 0) {
      state.snapshotUndo("clear", prev.id, prev.name, prev.entries);
    }
    state.replaceEntries(combo.sections);
    if (!silent) {
      toast({
        title: "Applied to current table",
        description: `${combo.sections.length} courses · ${combo.totalCredits} credits — Ctrl/Cmd+Z restores the old table`,
      });
    }
    onPreview(combo);
  };

  /** 🪄 greedy auto-fit: add wishlist courses (priority order) into the CURRENT table's free cells.
   *  Embedded halves (ETH/ELA) pull in their same-faculty partner automatically. */
  const [fitting, setFitting] = useState(false);
  const autoFitWishlist = () => {
    if (desired.length === 0) {
      toast({ title: "The wishlist is empty — add courses first" });
      return;
    }
    setFitting(true);
    setTimeout(async () => {
      try {
        const store = useFFCS.getState();
        const tid = store.activeTableId;
        const table = store.tables.find((t) => t.id === tid);
        // Ctrl/Cmd+Z restores the whole pre-fit table
        if (table && table.entries.length > 0) {
          useFFCS.getState().snapshotUndo("clear", table.id, table.name, table.entries);
        }
        const entriesNow = () =>
          useFFCS.getState().tables.find((t) => t.id === tid)?.entries || [];

        // make sure we have section lists for every wishlist code (local dataset)
        const missing = desired.filter((w) => !sectionsByCode[w.code]);
        const fetched: Record<string, CourseSection[]> = {};
        for (const w of missing) {
          const secs = getSectionsByCode(w.code);
          if (secs.length > 0) fetched[w.code] = secs;
        }
        if (Object.keys(fetched).length > 0) {
          setSectionsByCode((prev) => ({ ...prev, ...fetched }));
        }

        const fitted: string[] = [];
        const failed: string[] = [];
        for (const w of desired) {
          const secs = sectionsByCode[w.code] || fetched[w.code] || [];
          const entries = entriesNow();
          if (entries.some((e) => e.code === w.code)) {
            failed.push(`${w.code} (already in table)`);
            continue;
          }
          if (secs.length === 0) {
            failed.push(`${w.code} (no sections published)`);
            continue;
          }
          const candidates = secs.filter(
            (s) => clashWithEntries(s, entries, campus).length === 0
          );
          if (candidates.length === 0) {
            failed.push(`${w.code} (all ${secs.length} sections clash)`);
            continue;
          }
          // prefer the candidate whose week ends earliest, then starts latest (gentle on the schedule)
          const endOf = (s: CourseSection) =>
            Math.max(...s.slot.split("+").flatMap((c) => getSectionMeetings(c, campus).map((m) => m.end)), 0);
          const startOf = (s: CourseSection) =>
            Math.min(...s.slot.split("+").flatMap((c) => getSectionMeetings(c, campus).map((m) => m.start)), 1440);
          const pick = [...candidates].sort((a, b) => endOf(a) - endOf(b) || startOf(b) - startOf(a))[0];
          const res = useFFCS.getState().addSectionWithPair(pick, tid);
          if (res.ok) {
            fitted.push(
              res.paired
                ? `${pick.code} pair (${pick.type} ${pick.slot} + ${res.paired.type} ${res.paired.slot}) · ${pick.faculty}`
                : `${pick.code} ${pick.slot} · ${pick.faculty}`
            );
          } else failed.push(`${w.code} (${res.reason})`);
        }

        if (fitted.length === 0 && failed.length === 0) {
          toast({ title: "Nothing to fit" });
          return;
        }
        toast({
          title:
            fitted.length > 0
              ? `🪄 Fitted ${fitted.length} of ${desired.length} wishlist course${desired.length > 1 ? "s" : ""}`
              : "🪄 Nothing fit — every wishlist course clashed",
          description:
            fitted.length > 0
              ? `${fitted.slice(0, 3).join(", ")}${fitted.length > 3 ? ` +${fitted.length - 3} more` : ""}` +
                (failed.length > 0 ? ` — skipped: ${failed.slice(0, 2).join(", ")}` : "")
              : failed.slice(0, 3).join(", "),
          variant: fitted.length > 0 ? "default" : "destructive",
        });
      } finally {
        setFitting(false);
      }
    }, 30);
  };

  /** copy a tick-box registration checklist of the wishlist to the clipboard */
  const copyChecklist = async () => {
    if (desired.length === 0) {
      toast({ title: "Wishlist is empty — add courses first" });
      return;
    }
    const lines = desired.map((d) => {
      const pin = d.lockedSectionId != null ? ` — pin: ${d.lockedLabel}` : "";
      const secs = sectionsByCode[d.code] || [];
      const embedded =
        secs.some((s) => s.type === "ETH") && secs.some((s) => s.type === "ELA");
      const embNote = embedded ? " (EMBEDDED: register ETH + ELA — SAME faculty!)" : "";
      return `[ ] ${d.priority}. ${d.code}${d.title ? ` — ${d.title}` : ""}${embNote}${pin}`;
    });
    const text = [
      "Registration checklist (from FFCSketch)",
      ...lines,
      "",
      "Tip: sections fill fast — keep this open during registration!",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Checklist copied! 📋",
        description: "Paste it into your notes or your group chat.",
      });
    } catch {
      // clipboard blocked — fall back to a hidden textarea + execCommand
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast({ title: "Checklist copied! 📋" });
      } catch {
        toast({ title: "Copy failed — clipboard blocked by browser", variant: "destructive" });
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* left: course picker */}
      <div className="lg:col-span-2">
        <div
          className="p-3"
          style={{
            border: "2.5px solid var(--ffcs-ink)",
            borderRadius: "12px 6px 14px 8px / 8px 14px 6px 12px",
            background: "var(--card)",
            boxShadow: "3px 4px 0 var(--shadow-ink)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} />
            <h3 className="ffcs-label" style={{ fontSize: "0.85rem" }}>
              Pick your courses & priorities
            </h3>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted-ink)", marginBottom: 8 }}>
            Priority 1 = most important. If no clash-free combo exists, the generator drops
            lowest-priority courses first. Click 🔓 to pin a must-have faculty + slot — pinned
            sections are never dropped.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addCourse(codeInput);
            }}
            className="flex gap-2 mb-3"
          >
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Course code e.g. CSE2001"
              aria-label="Course code"
              style={{
                flex: 1,
                border: "2px solid var(--ffcs-ink)",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                padding: "7px 12px",
                fontFamily: "inherit",
                background: "var(--input)",
                fontSize: "0.9rem",
                textTransform: "uppercase",
              }}
            />
            <button
              type="submit"
              className="prio-btn"
              style={{ width: 38, height: 38, background: "var(--accent)", color: "var(--on-accent)" }}
              aria-label="Add course"
            >
              +
            </button>
          </form>

          {/* import the current table's courses as a starting wishlist */}
          {activeTable && activeTable.entries.length > 0 && (
            <button
              type="button"
              className="import-table-chip"
              onClick={() => {
                const added = useFFCS
                  .getState()
                  .addToWishlist(
                    activeTable.entries.map((e) => ({ code: e.code, title: e.title }))
                  );
                if (added > 0) {
                  setCombos(null);
                  toast({
                    title: `Imported ${added} course${added > 1 ? "s" : ""} from “${activeTable.name}” 📋`,
                    description: "Priorities appended — reorder or pin, then generate.",
                  });
                } else {
                  toast({ title: "All of this table's courses are already in the wishlist" });
                }
              }}
              title="Start from what you already built — copies this table's courses into the wishlist"
            >
              <Download size={13} className="inline mr-1" style={{ verticalAlign: "-2px" }} />
              import current table ({activeTable.entries.length})
            </button>
          )}

          {wishlist.length > 0 && (
            <button
              type="button"
              className="autofit-btn"
              onClick={autoFitWishlist}
              disabled={fitting}
              title="Keep your current table — greedily add wishlist courses into the free cells, best-fit first"
            >
              {fitting ? (
                <Loader2 size={13} className="inline mr-1 animate-spin" style={{ verticalAlign: "-2px" }} />
              ) : (
                <Wand2 size={13} className="inline mr-1" style={{ verticalAlign: "-2px" }} />
              )}
              {fitting ? "fitting…" : `auto-fit wishlist into free cells (${wishlist.length})`}
            </button>
          )}

          {/* theory-window filters — the ONLY two filters */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Generator filters">
            <span className="ffcs-label" style={{ fontSize: "0.72rem", width: "100%", marginBottom: -2 }}>
              Filter theory slots… <span style={{ opacity: 0.6, fontWeight: 400 }}>(labs are never filtered)</span>
            </span>
            <button
              type="button"
              className="pref-chip"
              aria-pressed={morningTheory}
              onClick={() => {
                setMorningTheory((v) => !v);
                setCombos(null);
              }}
              style={{
                background: morningTheory ? "var(--accent)" : "var(--input)",
                color: morningTheory ? "var(--on-accent)" : "var(--ffcs-ink)",
              }}
              title="Only generate with theory slots before lunch (end by 1:20 PM)"
            >
              🌅 morning theory {morningTheory && !eveningTheory ? "✓" : ""}
            </button>
            <button
              type="button"
              className="pref-chip"
              aria-pressed={eveningTheory}
              onClick={() => {
                setEveningTheory((v) => !v);
                setCombos(null);
              }}
              style={{
                background: eveningTheory ? "var(--tt9)" : "var(--input)",
                color: "var(--ffcs-ink)",
                fontWeight: eveningTheory ? "bold" : "normal",
              }}
              title="Only generate with theory slots after lunch (start 2:00 PM or later)"
            >
              🌆 evening theory {eveningTheory && !morningTheory ? "✓" : ""}
            </button>
          </div>

          {desired.length >= 8 && (
            <div
              className="warn-strip"
              role="note"
              style={{ marginBottom: 8 }}
            >
              🧺 {desired.length} courses in the wishlist — big lists can explode the search space.
              Pin must-haves 🔒 (they are tried first) or trim a few for speed.
            </div>
          )}

          {desired.length === 0 ? (
            <div style={{ border: "2px dashed var(--label-ink)", borderRadius: 10, padding: "14px", color: "var(--label-ink)", textAlign: "center", fontSize: "0.85rem" }}>
              No courses picked yet. Try CSE2001, BMAT201L…
            </div>
          ) : (
            <div className="ffcs-scroll" style={{ maxHeight: 360, overflowY: "auto" }}>
              {desired.map((d, i) => {
                const locked = d.lockedSectionId != null;
                const sections = sectionsByCode[d.code] || [];
                const isEmbedded =
                  sections.some((x) => x.type === "ETH") && sections.some((x) => x.type === "ELA");
                return (
                  <div key={d.code} style={{ marginBottom: 6 }}>
                    <div
                      className="flex items-center gap-2 p-2"
                      style={{
                        border: locked ? "2px solid var(--good-strong)" : "2px solid var(--ffcs-ink)",
                        borderRadius: "8px 4px 10px 5px",
                        background: i === 0 && !locked ? "var(--accent)" : locked ? "var(--good-soft)" : "var(--input)",
                        color: i === 0 && !locked ? "var(--on-accent)" : "var(--ffcs-ink)",
                      }}
                    >
                      <span
                        className="chip"
                        style={{ background: "var(--card)", fontWeight: "bold", minWidth: 24, textAlign: "center" }}
                        title="Priority"
                      >
                        {d.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <strong style={{ fontSize: "0.88rem" }}>{d.code}</strong>
                        {locked ? (
                          <div className="truncate" style={{ fontSize: "0.75rem", color: "var(--good-strong)", fontWeight: "bold" }}>
                            🔒 {d.lockedLabel}
                          </div>
                        ) : (
                          <div className="truncate" style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                            {d.title} · {sections.length} sections
                            {isEmbedded && (
                              <span
                                title="Embedded course — every combo pairs the lab (ELA) with the SAME faculty automatically"
                                style={{ color: "var(--good-strong)", fontWeight: "bold" }}
                              >
                                {" "}· 🔗 ETH+ELA pair
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        className="prio-btn"
                        onClick={() => setPickerFor(pickerFor === d.code ? null : d.code)}
                        title={locked ? "Change or unpin section" : "Pin a specific section (faculty + slot)"}
                        aria-label={locked ? `Unpin ${d.code}` : `Pin a section of ${d.code}`}
                        style={{
                          background: locked ? "var(--good-strong)" : "var(--card)",
                          color: locked ? "var(--card)" : "var(--ffcs-ink)",
                        }}
                      >
                        {locked ? <Lock size={12} /> : <LockOpen size={12} />}
                      </button>
                      <button className="prio-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                        <ArrowUp size={12} />
                      </button>
                      <button
                        className="prio-btn"
                        onClick={() => move(i, 1)}
                        disabled={i === desired.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        className="prio-btn"
                        onClick={() => removeCourse(d.code)}
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                        aria-label={`Remove ${d.code}`}
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* section picker for pinning */}
                    {pickerFor === d.code && (
                      <div
                        className="ffcs-scroll"
                        style={{
                          margin: "4px 0 2px",
                          border: "2px dashed var(--good-strong)",
                          borderRadius: "8px 5px 10px 6px",
                          maxHeight: 180,
                          overflowY: "auto",
                          background: "var(--card)",
                          padding: 4,
                        }}
                        role="listbox"
                        aria-label={`Pick a section of ${d.code} to pin`}
                      >
                        {locked && (
                          <button
                            onClick={() => lockSection(d.code, null)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              fontFamily: "inherit",
                              fontSize: "0.78rem",
                              padding: "4px 6px",
                              border: "2px solid var(--danger)",
                              borderRadius: 6,
                              background: "var(--bad-soft)",
                              color: "var(--danger)",
                              cursor: "pointer",
                              marginBottom: 3,
                            }}
                          >
                            ✕ Unpin — free all sections again
                          </button>
                        )}
                        {sections.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => lockSection(d.code, s)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              fontFamily: "inherit",
                              fontSize: "0.78rem",
                              padding: "4px 6px",
                              border: "2px solid var(--cell-border)",
                              borderRadius: 6,
                              background: s.id === d.lockedSectionId ? "var(--good-soft)" : "var(--input)",
                              cursor: "pointer",
                              marginBottom: 3,
                            }}
                          >
                            <strong>{s.slot}</strong> · {s.faculty}
                            {s.id === d.lockedSectionId ? " ✓" : ""}
                          </button>
                        ))}
                        {sections.length === 0 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--label-ink)", padding: 4 }}>
                            no sections in the dataset
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              className="btn flex-1"
              onClick={runGenerate}
              disabled={generating || surprising || desired.length === 0}
              style={{
                border: "2.5px solid var(--ffcs-ink)",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                background: "var(--good)",
                fontFamily: "inherit",
                fontWeight: "bold",
                padding: "9px",
                opacity: desired.length === 0 ? 0.5 : 1,
              }}
            >
              {generating ? (
                <>
                  <Loader2 className="inline animate-spin mr-1" size={15} /> crunching slots…
                </>
              ) : (
                <>
                  <Cpu className="inline mr-1" size={15} /> Generate clash-free timetables
                </>
              )}
            </button>
            <button
              className="btn dice-btn"
              onClick={surpriseMe}
              disabled={generating || surprising || desired.length === 0}
              title="Let fate decide — apply a random clash-free combo"
              aria-label="Surprise me with a random clash-free timetable"
              style={{
                border: "2.5px solid var(--ffcs-ink)",
                borderRadius: "15px 225px 15px 255px / 255px 15px 225px 15px",
                background: "var(--accent)",
                color: "var(--on-accent)",
                fontFamily: "inherit",
                fontWeight: "bold",
                padding: "9px 14px",
                opacity: desired.length === 0 ? 0.5 : 1,
              }}
            >
              {surprising ? <Loader2 className="animate-spin" size={15} /> : <span aria-hidden>🎲</span>} Surprise me!
            </button>
          </div>

          <button
            type="button"
            className="btn checklist-btn mt-2"
            onClick={copyChecklist}
            disabled={desired.length === 0}
            title="Copy a tick-box checklist of your wishlist, in priority order"
            style={{
              width: "100%",
              border: "2px dashed var(--ffcs-ink)",
              borderRadius: "10px 6px 12px 7px / 7px 12px 6px 10px",
              background: "var(--card)",
              color: "var(--ffcs-ink)",
              fontFamily: "inherit",
              fontSize: "0.85rem",
              padding: "7px",
              opacity: desired.length === 0 ? 0.5 : 1,
              cursor: desired.length === 0 ? "not-allowed" : "pointer",
            }}
            aria-label="Copy registration checklist"
          >
            <ClipboardList className="inline mr-1" size={14} /> Copy checklist (priority order)
          </button>
        </div>
      </div>

      {/* right: results */}
      <div className="lg:col-span-3">
        {combos === null ? (
          <div
            className="text-center py-12"
            style={{
              border: "2px dashed var(--label-ink)",
              borderRadius: "12px 6px 14px 8px",
              color: "var(--label-ink)",
            }}
          >
            <span className="empty-doodle" aria-hidden>
              ✏️
            </span>
            <p style={{ fontSize: "0.92rem" }}>
              Generated timetables will appear here — ranked to match your preferences.
            </p>
            <p style={{ fontSize: "0.8rem", opacity: 0.8 }}>
              Fewer gaps and free days score higher — use the 🌅 / 🌆 filters to restrict theory slots to mornings or after lunch.
            </p>
          </div>
        ) : combos.length === 0 ? (
          <div className="clash-note text-center py-10">
            <strong>No clash-free combination exists.</strong>
            <p style={{ fontSize: "0.85rem" }}>
              The generator even tried dropping your 2 lowest-priority courses.
              {(morningTheory || eveningTheory) &&
                " A 🌅/🌆 theory filter can also make this impossible — try turning it off."}
            </p>
          </div>
        ) : (
          <div>
            <div className="ffcs-label mb-2 flex flex-wrap items-center gap-1.5">
              {combos.length} combos · sorted best first · click "Apply" to load into current table
              {morningTheory && !eveningTheory && (
                <span className="chip" style={{ background: "var(--accent)", color: "var(--on-accent)", fontSize: "0.72rem" }}>
                  🌅 morning theory only
                </span>
              )}
              {eveningTheory && !morningTheory && (
                <span className="chip" style={{ background: "var(--tt9)", color: "var(--ffcs-ink)", fontWeight: "bold", fontSize: "0.72rem" }}>
                  🌆 evening theory only
                </span>
              )}
            </div>
            <div className="ffcs-scroll grid gap-2.5" style={{ maxHeight: 620, overflowY: "auto" }}>
              {combos.map((c, idx) => (
                <div
                  key={c.id}
                  className={`combo-card p-3${idx === 0 ? " best" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span
                      className="chip"
                      style={{
                        background: idx === 0 ? "var(--good-strong)" : "var(--ffcs-ink)",
                        color: "var(--card)",
                        fontWeight: "bold",
                      }}
                    >
                      {idx === 0 ? "★ BEST" : `#${idx + 1}`}
                    </span>
                    <span className="chip">{c.sections.length} courses</span>
                    <span className="chip">{c.totalCredits} credits</span>
                    <span className="chip">{c.gapCount} gaps</span>
                    <span className="chip">
                      {c.earliestStart && c.latestEnd
                        ? `${fmtTime(c.earliestStart)} → ${fmtTime(c.latestEnd)}`
                        : "—"}
                    </span>
                    {c.freeDays.length > 0 && (
                      <span className="chip" style={{ background: "var(--good)" }}>
                        free: {c.freeDays.map((d) => DAY_LABELS[d].slice(0, 3)).join(", ")}
                      </span>
                    )}
                    {c.droppedCodes.length > 0 && (
                      <span className="chip" style={{ background: "var(--bad)", borderColor: "var(--danger)" }}>
                        dropped: {c.droppedCodes.join(", ")}
                      </span>
                    )}
                    <div className="flex-1" />
                    <button
                      className="btn btn-small peek-btn"
                      onClick={() => onPeek(c)}
                      title="Pencil this combo onto the timetable as dashed ghost blocks — preview before committing"
                      style={{
                        border: "2px dashed var(--ffcs-ink)",
                        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                        background: "var(--card)",
                        color: "var(--ffcs-ink)",
                        fontFamily: "inherit",
                        fontSize: "0.82rem",
                        padding: "3px 10px",
                      }}
                    >
                      <Eye size={12} className="inline mr-0.5" style={{ verticalAlign: "-1.5px" }} /> peek
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => applyCombo(c)}
                      style={{
                        border: "2px solid var(--ffcs-ink)",
                        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                        background: idx === 0 ? "var(--accent)" : "var(--card)",
                        color: "var(--ffcs-ink)",
                        fontFamily: "inherit",
                        fontSize: "0.82rem",
                        padding: "3px 12px",
                      }}
                    >
                      Apply →
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.sections.map((s) => {
                      const isLocked = desired.some(
                        (d) => d.code === s.code && d.lockedSectionId === s.id
                      );
                      return (
                        <span
                          key={s.id}
                          className="chip"
                          style={{
                            fontSize: "0.72rem",
                            ...(isLocked
                              ? { background: "var(--good-soft)", borderColor: "var(--good-strong)" }
                              : {}),
                          }}
                          title={isLocked ? "Pinned section — included in every combo" : undefined}
                        >
                          {isLocked ? "🔒 " : ""}
                          {s.code} · {s.slot} · {s.faculty}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
