"use client";

/**
 * Export helpers — PNG downloads via `html-to-image`.
 *
 * Why not html2canvas: it re-draws every glyph with canvas fillText, which
 * comes out blurry/jagged with hand-written fonts at small sizes. `toPng`
 * serializes the real DOM (SVG foreignObject) so the browser rasterizes the
 * exact same text the user sees — razor sharp at 2.5× pixel ratio.
 *
 * Two exports:
 *  - exportElementToPng  → capture any view as-is (Slot View, Compare)
 *  - exportTimetablePng  → composite sheet: header + weekly grid + full
 *                          course list table (Timetable tab)
 */

import { CartEntry, Campus, COURSE_TYPE_LABELS, CourseType, Day, DAYS } from "./types";
import { getSectionMeetings, LUNCH_LABEL } from "./slots";

const PIXEL_RATIO = 2.5;

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function paperBg(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#fffef9";
}

async function nodeToPng(
  el: HTMLElement,
  backgroundColor: string,
  cloneStyle?: Record<string, string>
): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(el, {
    backgroundColor,
    pixelRatio: PIXEL_RATIO,
    // html-to-image copies the node's computed position onto the SVG clone —
    // an offscreen capture node (left:-30000px) would render OUTSIDE the
    // foreignObject viewport and come out blank. Override it on the clone.
    style: cloneStyle,
  });
}

/** Capture any mounted view (Slot View grid column, Compare root) as one PNG. */
export async function exportElementToPng(el: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await nodeToPng(el, paperBg());
  downloadDataUrl(dataUrl, filename);
}

/* ------------------------------------------------------------------ */
/* Timetable sheet: header + grid + course list                        */
/* ------------------------------------------------------------------ */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtHM(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Build an offscreen "paper sheet" containing the weekly grid (cloned from
 * the live view) plus a full course list, then rasterize it. The course list
 * is rendered with inline styles so it always prints identically.
 */
export async function exportTimetablePng(
  gridContainer: HTMLElement,
  filename: string,
  entries: CartEntry[],
  tableName: string,
  _campus: Campus
): Promise<void> {
  const bg = paperBg();
  const ink = getComputedStyle(gridContainer).color || "#2d2926";
  const width = Math.max(980, Math.round(gridContainer.offsetWidth) || 980);
  const totalCredits = entries.reduce((s, e) => s + e.credits, 0);

  const sheet = document.createElement("div");
  sheet.setAttribute("data-export-sheet", "");
  sheet.style.cssText = [
    "position:absolute",
    "left:-30000px",
    "top:0",
    `width:${width}px`,
    `background:${bg}`,
    `color:${ink}`,
    "padding:26px 30px 20px",
    "box-sizing:border-box",
  ].join(";");

  /* header */
  const head = document.createElement("div");
  head.style.cssText =
    "display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;" +
    "border-bottom:3px solid currentColor;padding-bottom:10px;margin-bottom:14px;";
  head.innerHTML = `
    <div style="font-size:26px;font-weight:700;line-height:1.1;">
      ${esc(tableName || "My Timetable")}
      <span style="font-weight:400;font-size:14px;opacity:0.75;"> · VIT Chennai</span>
    </div>
    <div style="font-size:13.5px;opacity:0.85;">
      ${entries.length} course${entries.length === 1 ? "" : "s"} ·
      ${totalCredits % 1 === 0 ? totalCredits : totalCredits.toFixed(1)} credits ·
      lunch ${esc(LUNCH_LABEL)}
    </div>`;
  sheet.appendChild(head);

  /* weekly grid — clone the live table so it looks exactly like on screen */
  const grid = gridContainer.querySelector(".tt-wrap");
  if (grid) {
    const clone = grid.cloneNode(true) as HTMLElement;
    clone.style.cssText += ";margin-bottom:18px;";
    // strip interactive affordances that make no sense in a static image
    clone.querySelectorAll<HTMLElement>(".tt-empty-slot").forEach((n) => {
      n.style.opacity = "0.35";
    });
    sheet.appendChild(clone);
  }

  /* course list */
  const listTitle = document.createElement("div");
  listTitle.textContent = "Course list";
  listTitle.style.cssText =
    "font-size:15px;font-weight:700;letter-spacing:0.4px;margin:6px 0 8px;text-transform:uppercase;";
  sheet.appendChild(listTitle);

  const rows = [...entries].sort(
    (a, b) => a.code.localeCompare(b.code) || a.type.localeCompare(b.type)
  );
  const th = (label: string, extra = "") =>
    `<th style="text-align:left;padding:6px 8px;border-bottom:2.5px solid currentColor;font-size:11.5px;letter-spacing:0.5px;text-transform:uppercase;${extra}">${label}</th>`;
  const td = (content: string, extra = "") =>
    `<td style="padding:6px 8px;border-bottom:1.6px dashed currentColor;font-size:13px;vertical-align:top;${extra}">${content}</td>`;

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;";
  table.innerHTML = `
    <thead><tr>
      ${th("#", "width:28px")}
      ${th("Code")}
      ${th("Course Title")}
      ${th("Type", "width:52px")}
      ${th("Slot", "width:90px")}
      ${th("Faculty", "width:120px")}
      ${th("Venue", "width:96px")}
      ${th("Cr", "width:34px;text-align:right")}
    </tr></thead>
    <tbody>
      ${rows
        .map((e, i) => {
          const type = COURSE_TYPE_LABELS[e.type as CourseType] || e.type;
          const meetings = getSectionMeetings(e.slot, _campus)
            .slice(0, 2)
            .map((m) => `${["Mon", "Tue", "Wed", "Thu", "Fri"][DAYS.indexOf(m.day as Day)]} ${fmtHM(m.start)}`)
            .join(", ");
          return `<tr>
            ${td(String(i + 1), "opacity:0.6")}
            ${td(`<strong>${esc(e.code)}</strong>`)}
            ${td(esc(e.title))}
            ${td(esc(type), "font-size:11.5px")}
            ${td(esc(e.slot) + (meetings ? `<div style="font-size:10.5px;opacity:0.65;">${esc(meetings)}</div>` : ""))}
            ${td(esc(e.faculty))}
            ${td(e.venue ? esc(e.venue) : '<span style="opacity:0.4;">—</span>', "font-size:12px")}
            ${td(String(e.credits), "text-align:right")}
          </tr>`;
        })
        .join("")}
    </tbody>`;
  sheet.appendChild(table);

  /* footer */
  const foot = document.createElement("div");
  foot.textContent = "sketched with FFCSketch ✏️ · VIT Chennai";
  foot.style.cssText = "margin-top:14px;font-size:12px;opacity:0.6;text-align:right;";
  sheet.appendChild(foot);

  document.body.appendChild(sheet);
  try {
    // render the CLONE at the SVG viewport origin — the live node stays offscreen
    const cloneStyle = { position: "static", left: "0", top: "0", margin: "0" };
    // two passes: first render warms the font/style cache, second is exact
    await nodeToPng(sheet, bg, cloneStyle);
    const dataUrl = await nodeToPng(sheet, bg, cloneStyle);
    downloadDataUrl(dataUrl, filename);
  } finally {
    sheet.remove();
  }
}

/* ---------------- timetable as text (WhatsApp-friendly) ---------------- */

const DAY_HEAD: Record<Day, string> = {
  mon: "MONDAY",
  tue: "TUESDAY",
  wed: "WEDNESDAY",
  thu: "THURSDAY",
  fri: "FRIDAY",
};

/**
 * Render a timetable as a plain-text day-by-day list that pastes nicely
 * into WhatsApp / Telegram / email. Uses the same meeting maths as the grid.
 */
export function timetableToText(
  entries: CartEntry[],
  campus: Campus,
  tableName: string
): string {
  const campusLabel = "VIT Chennai campus";
  const totalCredits = entries.reduce((s, e) => s + e.credits, 0);
  const lines: string[] = [
    `🗓 ${tableName || "My Timetable"} — ${campusLabel}`,
    `${entries.length} course${entries.length === 1 ? "" : "s"} · ${
      totalCredits % 1 === 0 ? totalCredits : totalCredits.toFixed(1)
    } credits`,
    "━━━━━━━━━━━━━━━━━━",
  ];

  for (const day of DAYS) {
    const meetings: {
      start: number;
      end: number;
      text: string;
    }[] = [];
    for (const e of entries) {
      const typeLabel = COURSE_TYPE_LABELS[e.type as CourseType] || e.type;
      for (const m of getSectionMeetings(e.slot, campus)) {
        if (m.day !== day) continue;
        meetings.push({
          start: m.start,
          end: m.end,
          text: `${fmtHM(m.start)}–${fmtHM(m.end)}  ${e.code} ${typeLabel} (${e.slot}) · ${e.faculty}`,
        });
      }
    }
    lines.push("");
    if (meetings.length === 0) {
      lines.push(`${DAY_HEAD[day]} — free day 🎈`);
      continue;
    }
    lines.push(DAY_HEAD[day]);
    meetings.sort((a, b) => a.start - b.start);
    lines.push(...meetings.map((m) => `  • ${m.text}`));
  }

  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("sketched with FFCSketch ✏️");
  return lines.join("\n");
}
