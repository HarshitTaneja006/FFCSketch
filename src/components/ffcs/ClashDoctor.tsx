"use client";

/**
 * ClashDoctor — when the active table has clashes, this panel explains every
 * clashing pair (exact overlapping windows) and offers one-click quick fixes:
 * swap the offending course to a clash-free alternative section, remove it,
 * or send both courses to the Generator to work out a full combination.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Stethoscope, ArrowLeftRight, Trash2, Wand2 } from "lucide-react";
import { CartEntry, ClashInfo, Campus, CourseSection, DAY_LABELS, Day } from "@/lib/ffcs/types";
import { clashWithEntries } from "@/lib/ffcs/timetable";
import { fmtTime } from "@/lib/ffcs/slots";
import { getSectionsByCode } from "@/lib/ffcs/courseData";
import { useFFCS } from "@/store/ffcs";
import { toast } from "@/hooks/use-toast";

const MAX_FIXES = 3;
/** cap the rendered clash pairs — a whole-report import can produce THOUSANDS
 *  of pairs and rendering them all freezes the tab. Show the first few, fix
 *  those first (the list shrinks as you go). */
const MAX_PAIRS = 8;

interface ClashDoctorProps {
  entries: CartEntry[];
  campus: Campus;
  clashes: ClashInfo[];
  onGoToGenerator: () => void;
}

/** "Mon 10:00 AM–10:50 AM · Wed 8:00 AM–8:50 AM" style label for overlapping windows */
function overlapLabel(meetings: ClashInfo["meetings"]): string {
  if (meetings.length === 0) return "";
  const byDay = new Map<Day, string[]>();
  for (const m of meetings) {
    const label = `${fmtTime(m.start)}–${fmtTime(m.end)}`;
    (byDay.get(m.day) || byDay.set(m.day, []).get(m.day)!).push(label);
  }
  return [...byDay.entries()]
    .sort(
      (a, b) =>
        (Object.keys(DAY_LABELS) as Day[]).indexOf(a[0]) -
        (Object.keys(DAY_LABELS) as Day[]).indexOf(b[0])
    )
    .map(([day, times]) => `${DAY_LABELS[day].slice(0, 3)} ${times.join(", ")}`)
    .join("  ·  ");
}

export default function ClashDoctor({ entries, campus, clashes, onGoToGenerator }: ClashDoctorProps) {
  const swapSection = useFFCS((s) => s.swapSection);
  const removeEntry = useFFCS((s) => s.removeEntry);
  const addToWishlist = useFFCS((s) => s.addToWishlist);

  /** computed fixes, bound to the clash signature they were computed for */
  const [computed, setComputed] = useState<{ sig: string; fixes: Record<string, CourseSection[]> }>({
    sig: "",
    fixes: {},
  });
  /** section cache per course code so two clashes sharing a course fetch once */
  const sectionsCache = useRef<Record<string, CourseSection[]>>({});

  const entryByUid = useMemo(() => {
    const map = new Map<string, CartEntry>();
    for (const e of entries) map.set(e.uid, e);
    return map;
  }, [entries]);

  /** resolved pairs with both entries still present */
  const pairs = useMemo(
    () =>
      clashes
        .map((c) => ({ info: c, a: entryByUid.get(c.aUid), b: entryByUid.get(c.bUid) }))
        .filter((p): p is { info: ClashInfo; a: CartEntry; b: CartEntry } => !!(p.a && p.b)),
    [clashes, entryByUid]
  );

  /** stable signature so the fetch effect only reruns when the clashes really change
   *  (built from the SHOWN pairs only — see MAX_PAIRS) */
  const shownPairs = useMemo(() => pairs.slice(0, MAX_PAIRS), [pairs]);
  const signature = useMemo(
    () =>
      shownPairs
        .map(
          (p) =>
            `${p.a.code}|${p.a.type}|${p.a.slot}|${p.a.faculty}~${p.b.code}|${p.b.type}|${p.b.slot}|${p.b.faculty}`
        )
        .join("#"),
    [shownPairs]
  );

  const ready = signature !== "" && computed.sig === signature;

  /** pure: clash-free alternatives for an entry (same course+type, clashing with nothing else left) */
  const computeFixesFor = useCallback(
    (entry: CartEntry): CourseSection[] => {
      const cacheKey = `${entry.code}|${entry.type}`;
      let all = sectionsCache.current[cacheKey];
      if (!all) {
        all = getSectionsByCode(entry.code) as CourseSection[];
        sectionsCache.current[cacheKey] = all;
      }
      const others = entries.filter((e) => e.uid !== entry.uid);
      return all
        .filter(
          (s) =>
            s.type === entry.type &&
            !(s.slot === entry.slot && s.faculty === entry.faculty) &&
            clashWithEntries(s, others, campus).length === 0
        )
        .slice(0, MAX_FIXES);
    },
    [entries, campus]
  );

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    (async () => {
      const uids = new Set<string>();
      for (const p of shownPairs) {
        uids.add(p.a.uid);
        uids.add(p.b.uid);
      }
      const fixes: Record<string, CourseSection[]> = {};
      for (const uid of uids) {
        const entry = entryByUid.get(uid);
        if (entry) fixes[uid] = computeFixesFor(entry);
      }
      if (!cancelled) setComputed({ sig: signature, fixes });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, signature, shownPairs, entryByUid, computeFixesFor]);

  const fixFor = (uid: string) => (ready ? computed.fixes[uid] : undefined);
  const isLoading = (uid: string) => !ready && entryByUid.has(uid);

  const applyFix = (uid: string, section: CourseSection) => {
    const res = swapSection(uid, section);
    if (res.ok) {
      toast({
        title: `Switched ${section.code} → ${section.slot} · ${section.faculty}`,
        description: "Ctrl/Cmd+Z restores the previous table",
      });
    } else {
      toast({ title: res.reason || "Swap failed", variant: "destructive" });
    }
  };

  const removeCourse = (entry: CartEntry) => {
    removeEntry(entry.uid);
    toast({ title: `Removed ${entry.code}`, description: "the clash went with it — Ctrl/Cmd+Z to undo" });
  };

  const sendBothToGenerator = (a: CartEntry, b: CartEntry) => {
    const added = addToWishlist([
      { code: a.code, title: a.title },
      { code: b.code, title: b.title },
    ]);
    onGoToGenerator();
    toast({
      title:
        added > 0
          ? `Sent ${added} course${added > 1 ? "s" : ""} to the Generator ✨`
          : "Already in the Generator wishlist ✨",
      description: "Generate there and apply a clash-free combo.",
    });
  };

  if (pairs.length === 0) return null;

  const totalInvolved = new Set(pairs.flatMap((p) => [p.a.uid, p.b.uid])).size;

  return (
    <div
      className="clash-doctor mb-3 no-print"
      role="alert"
      aria-label="Clash doctor with quick fixes"
      style={{
        border: "2.5px solid var(--danger)",
        borderRadius: "14px 7px 15px 8px / 8px 15px 7px 14px",
        background: "color-mix(in srgb, var(--bad) 14%, var(--card))",
        boxShadow: "3px 4px 0 var(--shadow-ink)",
        padding: "10px 12px",
        position: "relative",
      }}
    >
      <span className="doctor-sticker" aria-hidden>
        fix me!
      </span>

      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
        <Stethoscope size={16} style={{ color: "var(--danger)" }} className="doctor-pulse" aria-hidden />
        <strong style={{ fontSize: "0.95rem" }}>
          Clash doctor — {pairs.length} clash{pairs.length > 1 ? "es" : ""} across {totalInvolved} course
          {totalInvolved > 1 ? "s" : ""}
        </strong>
        <span style={{ fontSize: "0.78rem", color: "var(--muted-ink)" }}>
          quick fixes below, or let the Generator sort it out
        </span>
      </div>

      {pairs.length > shownPairs.length && (
        <div
          style={{
            fontSize: "0.78rem",
            color: "var(--danger)",
            fontWeight: 600,
            border: "1.5px dashed var(--danger)",
            borderRadius: 8,
            padding: "4px 8px",
            marginBottom: 6,
            background: "var(--card)",
          }}
        >
          + {pairs.length - shownPairs.length} more clashing pair
          {pairs.length - shownPairs.length > 1 ? "s" : ""} not shown — fix or remove the courses below
          first (the list shrinks as you go), or clear the table and add courses one at a time.
        </div>
      )}

      {shownPairs.map((p, i) => {
        const duplicate = p.info.meetings.length === 0 && p.a.code === p.b.code && p.a.type === p.b.type;
        return (
          <div key={`${p.info.aUid}-${p.info.bUid}-${i}`} className="clash-row">
            <div className="flex flex-wrap items-center gap-1.5" style={{ fontSize: "0.86rem" }}>
              <span className="chip" style={{ background: "var(--bad-soft)", fontWeight: "bold" }}>
                {p.a.code} · {p.a.slot} · {p.a.faculty}
              </span>
              <span className="clash-zap" aria-hidden>
                ⚡
              </span>
              <span className="chip" style={{ background: "var(--bad-soft)", fontWeight: "bold" }}>
                {p.b.code} · {p.b.slot} · {p.b.faculty}
              </span>
              {duplicate ? (
                <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>
                  — same course registered twice; remove one of them
                </span>
              ) : (
                <span style={{ fontSize: "0.78rem", color: "var(--muted-ink)" }}>
                  overlap: {overlapLabel(p.info.meetings)}
                </span>
              )}
            </div>

            {!duplicate && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{ marginTop: 6, paddingLeft: 2 }}>
                {([p.a, p.b] as const).map((entry) => (
                  <FixLine
                    key={entry.uid}
                    entry={entry}
                    fixes={fixFor(entry.uid)}
                    isLoading={isLoading(entry.uid)}
                    onFix={(s) => applyFix(entry.uid, s)}
                    onRemove={() => removeCourse(entry)}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 6 }}>
              <button
                className="fix-chip fix-gen"
                onClick={() => sendBothToGenerator(p.a, p.b)}
                title="Add both courses to the Generator wishlist and open it"
              >
                <Wand2 size={11} className="inline mr-0.5" style={{ verticalAlign: "-1.5px" }} />
                send both to Generator
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** one "fix {CODE}:" line with alternative-section chips + a remove chip */
function FixLine({
  entry,
  fixes,
  isLoading,
  onFix,
  onRemove,
}: {
  entry: CartEntry;
  fixes: CourseSection[] | undefined;
  isLoading: boolean;
  onFix: (s: CourseSection) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="ffcs-label" style={{ fontSize: "0.7rem" }}>
        fix {entry.code}:
      </span>
      {isLoading ? (
        <Loader2 size={12} className="animate-spin" aria-label={`loading fixes for ${entry.code}`} />
      ) : fixes && fixes.length === 0 ? (
        <span className="no-alt-chip">no clash-free alternative</span>
      ) : (
        (fixes || []).map((s) => (
          <button
            key={s.id}
            className="fix-chip"
            onClick={() => onFix(s)}
            title={`Swap ${entry.code} to slot ${s.slot} with ${s.faculty} — clashes with nothing else in your table`}
          >
            <ArrowLeftRight size={11} className="inline mr-0.5" style={{ verticalAlign: "-1.5px" }} />
            {s.slot} · {s.faculty}
          </button>
        ))
      )}
      <button
        className="fix-chip fix-remove"
        onClick={onRemove}
        title={`Remove ${entry.code} from the table`}
        aria-label={`Remove ${entry.code}`}
      >
        <Trash2 size={11} className="inline" style={{ verticalAlign: "-1.5px" }} />
      </button>
    </div>
  );
}

// v1.9 recompile nudge
