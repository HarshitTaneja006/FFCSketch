"use client";

import type { CSSProperties, ReactNode } from "react";
import { HelpCircle } from "lucide-react";

interface FaqItem {
  q: string;
  a: ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "What is FFCS?",
    a: "FFCS (Fully Flexible Credit System) is how VIT lets you build your own timetable. Every course runs in multiple sections, each tied to a fixed slot and faculty; during registration you pick exactly one section per course. Popular sections fill up within minutes, so planning a clash-free slot combination before registration is the whole game. This planner is built exclusively for the VIT Chennai campus — all slots, timings and courses use the Chennai timetable.",
  },
  {
    q: "How do I use this planner?",
    a: (
      <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
        <li>
          In the <strong>Timetable</strong> tab, use the <em>Add courses</em> panel:{" "}
          <strong>stage 1</strong> — search and pick a course; <strong>stage 2</strong> — pick
          the faculty/slot section you want. It lands straight on the grid.
        </li>
        <li>
          Clashing sections show up with red striped blocks — swap sections until everything
          fits, or let the <strong>Generator</strong> find clash-free combos for you.
        </li>
        <li>
          Use <strong>Share</strong> to create a link and send the final plan to your friends.
        </li>
      </ol>
    ),
  },
  {
    q: "What are slots (A1, B1, L1+L2)?",
    a: (
      <>
        Slots are fixed timetable codes published by VIT. Theory slots are a single 55-minute
        period — e.g. <code>A1</code> meets Monday 8:00-8:50 AM. Lab slots are 50-minute periods,
        usually taken in pairs — e.g. <code>L1+L2</code> meets Monday 8:00-9:40 AM. Test any set
        of slots together in the <strong>Slot View</strong> tab before you commit to sections.
      </>
    ),
  },
  {
    q: "What is a clash?",
    a: (
      <>
        A clash is any overlap between the meeting times of two selected sections — even by a few
        minutes. You can register for only one of them. This planner compares exact
        start/end intervals, draws clashing blocks with a red dashed stripe, and lists the
        conflicting pairs above the grid with quick-fix suggestions (🩺 Clash Doctor).
      </>
    ),
  },
  {
    q: "How does the Generator work?",
    a: (
      <>
        Add the courses you want and rank them by priority (1 = must-have). The generator walks
        through every combination of sections, keeps only clash-free ones, drops the
        lowest-priority courses if nothing fits, and then ranks the results by fewer gaps, earlier
        finish and more free days. Load any combo into your timetable and tweak it by hand — or
        press 🎲 Surprise me to apply a random one.
      </>
    ),
  },
  {
    q: "What does the Slot View tab do?",
    a: (
      <>
        It&rsquo;s a slot combination tester. Tap any slot codes (theory <code>A1…TDD2</code>,
        labs <code>L1…L60</code>) to stack them onto a weekly grid — overlaps light up as red
        conflict cells and the panel lists exactly which slot pairs fight. Use{" "}
        <strong>load my table</strong> to import the slots you already have, or test whether{" "}
        <em>A1 + B2 + TF1</em> can coexist before hunting for sections. Slots your current table
        already occupies are stamped ✏.
      </>
    ),
  },
  {
    q: "Can I add a course that isn't in the list (or is this official VIT)?",
    a: (
      <>
        <strong>Custom courses:</strong> yes — click <strong>✏ custom course</strong> in the
        Add-courses panel to pencil in a club, project or self-study slot with your own title,
        faculty and credits. It behaves exactly like a real section on the grid.
        <br />
        <br />
        <strong>Official VIT:</strong> <strong>No.</strong> This is an independent student-made
        planning tool, not affiliated with VIT. Course and slot data comes from the open-source
        FFCSonTheGo project (VIT Chennai, Fall 2026-27) and may be incomplete or outdated. Always
        verify courses, faculty and slots on the official registration portal before registering.
      </>
    ),
  },
];

const DETAILS_STYLE: CSSProperties = {
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
  marginBottom: 8,
  background: "var(--card)",
  boxShadow: "2px 3px 0 var(--shadow-ink)",
};

const SUMMARY_STYLE: CSSProperties = {
  cursor: "pointer",
  padding: "8px 14px",
  fontWeight: 700,
  fontSize: "0.95rem",
};

/** Paper-styled FAQ / help accordion for FFCSketch.
 *  The whole block is ONE collapsed <details> so it never stretches the page —
 *  open it only when you're stuck. */
export function HelpSection() {
  return (
    <section aria-label="Help and FAQ" className="no-print">
      <details style={{ ...DETAILS_STYLE, marginBottom: 0 }}>
        <summary style={SUMMARY_STYLE}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <HelpCircle size={15} /> Help &amp; FAQ
            <span style={{ fontWeight: 400, fontSize: "0.76rem", color: "var(--muted-ink)" }}>
              — tap to open {FAQS.length} answers
            </span>
          </span>
        </summary>
        <div style={{ padding: "4px 10px 10px" }}>
          {FAQS.map((item) => (
            <details key={item.q} style={DETAILS_STYLE}>
              <summary style={{ ...SUMMARY_STYLE, fontSize: "0.88rem" }}>{item.q}</summary>
              <div
                style={{
                  padding: "0 14px 10px",
                  fontSize: "0.9rem",
                  lineHeight: 1.55,
                  color: "var(--ffcs-ink)",
                }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}
