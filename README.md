# ✏️ FFCSketch — Sketch Your Semester

> **A fast, beautiful, hand-drawn timetable planner and schedule generator built exclusively for VIT Chennai.**  
> Plan your courses, resolve clashes, auto-generate conflict-free combinations, compare schedules, and share your plan with friends — 100% client-side, zero backend required.

---

## 📖 Table of Contents

- [✨ Highlights & Features](#-highlights--features)
- [🧩 Core Modules & Capabilities](#-core-modules--capabilities)
  - [1. Interactive Timetable Grid](#1-interactive-timetable-grid)
  - [2. 2-Stage Course Picker & Catalog](#2-2-stage-course-picker--catalog)
  - [3. Auto Timetable Generator](#3-auto-timetable-generator)
  - [4. Clash Doctor & Embedded Course Pairing](#4-clash-doctor--embedded-course-pairing)
  - [5. Timetable Comparison (Diff & Friend Sync)](#5-timetable-comparison-diff--friend-sync)
  - [6. Interactive Slot View](#6-interactive-slot-view)
  - [7. Sharing, Exporting & Backups](#7-sharing-exporting--backups)
- [⏰ VIT Chennai Timetable & Slot System](#-vit-chennai-timetable--slot-system)
- [🛠️ Tech Stack & Architecture](#️-tech-stack--architecture)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Development Server](#running-the-development-server)
  - [Building for Production](#building-for-production)
- [📁 Project Structure](#-project-structure)
- [📊 Excel (.xlsx) / CSV Import Specification](#-excel-xlsx--csv-import-specification)
- [⌨️ Keyboard Shortcuts](#️-keyboard-shortcuts)
- [💡 Tips & Best Practices for FFCS Registration](#-tips--best-practices-for-ffcs-registration)
- [📜 Disclaimer & Credits](#-disclaimer--credits)

---

## ✨ Highlights & Features

- 🎨 **Hand-Drawn Paper & Chalkboard Aesthetics:** Built with a playful sketch aesthetic using **PaperCSS**, **Neucha** handwriting typography, ink shadows, paper folds, and tape accents.
- 🌓 **Day & Night Sketch Themes:** Switch between warm parchment paper mode and dark chalkboard mode with zero flash of unstyled theme on boot.
- 🔄 **Two Grid Orientations:** Toggle between the classic **Vertical Layout** (Days along the top) and **Horizontal Layout** (Periods along the top).
- ⚡ **100% Client-Side & Offline First:** Complete course catalog bundled in-memory (`courses.json`). Full PWA support with service workers and offline caching.
- 🧠 **Smart DFS Combinatorial Generator:** Generates up to dozens of optimal, clash-free schedules in milliseconds using priority constraints, locked sections, and preference windows.
- 👻 **Peek Mode:** Preview generated combinations as dashed ghost blocks over your active timetable before deciding to apply them.
- 🔗 **Zero-Backend URL Share Links:** Encodes the entire timetable state into a compact Base64URL token directly in the link (`?s=...`).
- 🩺 **Clash Doctor & Embedded Pair Guardian:** Enforces the official VIT rule requiring Embedded Theory (`ETH`) and Embedded Lab (`ELA`) to be taken under the same faculty.
- 📸 **High-Resolution PNG Exports:** Produces 2.5× retina-sharp graphic timetable sheets featuring the weekly grid + complete course summary table.
- 💬 **WhatsApp / Telegram Plain-Text Export:** Formats your day-by-day schedule for clean messaging apps with a single click.
- 📑 **Multi-Table Drafts & Deep Comparison:** Maintain multiple schedule variants (e.g., Plan A, Plan B), compute stats deltas, and compare with friends.

---

## 🧩 Core Modules & Capabilities

### 1. Interactive Timetable Grid

The central workspace renders your active timetable with 55-minute theory intervals and 50-minute lab periods tailored to VIT Chennai's academic timetable structure.

- **Block Popovers:** Click any scheduled class block to:
  - View full course title, credits, slot label, venue, and faculty name.
  - Swap section/faculty in real time with immediate clash validation.
  - Assign custom pastel color highlights to individual courses.
  - Remove courses with instant floating undo support (`Ctrl+Z` / `Cmd+Z`).
- **Slot Finder ("What fits here?"):** Click any blank period cell on the timetable to reveal every theory and lab slot active during that specific window, with one-click filtering in the course picker.
- **Intelligent Lab Merging:** Consecutive lab periods (e.g. `L1+L2`, `L31+L32`) automatically combine into single continuous blocks, strictly respecting the lunch hour barrier (1:20 PM - 2:00 PM).

---

### 2. 2-Stage Course Picker & Catalog

Adding courses is structured as an ergonomic 2-stage workflow:

1. **Stage 1 (Course Search):** Search across thousands of sections by course code (e.g., `BCSE202L`), title, faculty, or slot. Filter by course category (`TH`, `ETH`, `ELA`, `LO`, `SS`, `EPJ`, `PJT`, `OC`) and credits.
2. **Stage 2 (Section & Faculty Selection):** Expand any course to inspect every available faculty section, their allocated slot string, classroom/lab venue, and live clash status against your current cart.

---

### 3. Auto Timetable Generator

When manually fitting dozens of courses becomes overwhelming, the **Generator** formulates all valid, clash-free permutations.

- **Wishlist & Priority Ranking:** Add desired courses and rank them by importance (Priority 1 = highest).
- **Pinned / Locked Sections:** Pin a specific favorite professor or slot for any course; the algorithm locks that section and solves for the remaining courses.
- **Theory Window Filters:**
  - 🌅 **Morning Theory Only:** All theory lectures end before 1:20 PM lunch.
  - 🌆 **Evening Theory Only:** All theory lectures start after 2:00 PM lunch.
- **Graceful Course Drop:** If no 100% clash-free combination exists, the algorithm drops the lowest-priority courses first to provide the best possible fallback schedules.
- **Multi-Metric Scoring:** Schedules are ranked using a composite score that penalizes gaps between classes, rewards free days (e.g., free Fridays), and prefers reasonable start/end times.
- **👻 Ghost Peek:** Click *Peek* on any generated combo to overlay it onto your live timetable grid as dashed outline blocks.

---

### 4. Clash Doctor & Embedded Course Pairing

VIT follows specific rules for course registration that FFCSketch automatically validates:

- **Embedded Course Pairing (`ETH` ⇄ `ELA`):** An embedded course must be registered as a pair under the **same faculty**.
  - Auto-adds the matching lab section when you pick an embedded theory section (and vice versa).
  - Flags lone halves or faculty mismatches in the cart with 1-click auto-repair buttons.
- **Clash Doctor Assistant:** Detects exact overlapping minute intervals between conflicting courses and surfaces alternative sections that fit clash-free.

---

### 5. Timetable Comparison (Diff & Friend Sync)

- **Side-by-Side Comparison:** Compare any two saved tables (e.g., *Morning Heavy* vs *Afternoon Heavy*).
- **Stat Deltas:** Computes net differences in total credits, contact hours, gap counts, and daily busy hours.
- **Course Diff Matrix:** Categorizes courses into *Common to Both*, *Only in Plan A*, and *Only in Plan B*.
- **Merged Plan Simulation:** Test what happens if you merge two plans together.
- **Friend Timetable Sync:** Paste a friend's share link to compare your schedule against theirs and find common free slots.

---

### 6. Interactive Slot View

An interactive slot matrix inspired by FFCS-inator:
- Visualizes all theory slots (`A1`-`G1`, `TA1`-`TG1`, `TAA1`-`TDD1`, `S11`, `S15`, `A2`-`G2`, `TA2`-`TG2`, `TAA2`-`TDD2`, `S1`-`S4`) and lab slots (`L1`-`L60`).
- Color-codes slots currently occupied by courses in your active table.
- **Custom Course Creator:** Select multiple slots on the matrix to instantly create and add a custom off-curriculum or club activity to your schedule.

---

### 7. Sharing, Exporting & Backups

| Export / Share Mode | Description |
| :--- | :--- |
| 🖼️ **Retina PNG Sheet** | Generates a 2.5× resolution PNG containing your timetable grid, course details table, venues, credits, and timing metadata. |
| 🔗 **Client-Side Share Link** | Encodes the complete timetable in the URL query string (`?s=...`). No database storage or user accounts required. |
| 📱 **QR Code** | Instant QR code generation for quick mobile scanning and sharing. |
| 💬 **WhatsApp / Plain Text** | Copies a formatted day-by-day timetable to your clipboard ready for WhatsApp/Telegram. |
| 💾 **Full JSON Backup & Restore** | Export all tables, wishlist courses, color palettes, and themes into a single portable `.json` file. |
| 📊 **Excel (.xlsx) / CSV Import** | Bulk-import course lists or friend schedules with intelligent fuzzy header recognition. |

---

## ⏰ VIT Chennai Timetable & Slot Reference

FFCSketch is calibrated specifically to the **VIT Chennai** campus period structure:

### Theory Slots Grid

| Time Slot | Mon | Tue | Wed | Thu | Fri |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **08:00 AM - 08:50 AM** | A1 | B1 | C1 | D1 | E1 |
| **08:55 AM - 09:45 AM** | F1 | G1 | A1 | B1 | C1 |
| **09:50 AM - 10:40 AM** | D1 | E1 | F1 | G1 | TA1 |
| **10:45 AM - 11:35 AM** | TB1 | TC1 | TD1 | TE1 | TF1 |
| **11:40 AM - 12:30 PM** | TG1 | TAA1 | TBB1 | TCC1 | TDD1 |
| **12:35 PM - 01:20 PM** | S11 | — | — | — | S15 |
| **01:20 PM - 02:00 PM** | 🥪 **LUNCH BREAK** | 🥪 **LUNCH BREAK** | 🥪 **LUNCH BREAK** | 🥪 **LUNCH BREAK** | 🥪 **LUNCH BREAK** |
| **02:00 PM - 02:50 PM** | A2 | B2 | C2 | D2 | E2 |
| **02:55 PM - 03:45 PM** | F2 | G2 | A2 | B2 | C2 |
| **03:50 PM - 04:40 PM** | D2 | E2 | F2 | G2 | TA2 |
| **04:45 PM - 05:35 PM** | TB2 | TC2 | TD2 | TE2 | TF2 |
| **05:40 PM - 06:30 PM** | TG2 | TAA2 | TBB2 | TCC2 | TDD2 |
| **06:35 PM - 07:25 PM** | S3 | S1 | S4 | S2 | — |

### Lab Slots Grid

- **Morning Labs (50 min each):** `L1`-`L6` (Mon), `L7`-`L12` (Tue), `L13`-`L18` (Wed), `L19`-`L24` (Thu), `L25`-`L30` (Fri)
- **Afternoon Labs (50 min each):** `L31`-`L36` (Mon), `L37`-`L42` (Tue), `L43`-`L48` (Wed), `L49`-`L54` (Thu), `L55`-`L60` (Fri)

---

## 🛠️ Tech Stack & Architecture

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **UI Library:** [React 19](https://react.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/), [PaperCSS](https://www.getpapercss.com/) (hand-drawn components)
- **State Management:** [Zustand 5](https://zustand-demo.pmnd.rs/) with LocalStorage persistence
- **Icons:** [Lucide React](https://lucide.dev/)
- **Export Engine:** [html-to-image](https://github.com/bubkoo/html-to-image) (SVG foreignObject high-DPI rasterization)
- **Spreadsheet Parser:** [SheetJS (xlsx)](https://sheetjs.com/)
- **QR Code Engine:** [qrcode](https://www.npmjs.com/package/qrcode)
- **Typography:** [Google Fonts (Neucha)](https://fonts.google.com/specimen/Neucha)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.18+ or [Bun](https://bun.sh/) (recommended for fastest builds)
- npm, yarn, pnpm, or bun

### Installation

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/HarshitTaneja006/FFCSketch.git
cd FFCSketch

# Install dependencies using Bun
bun install

# Or using npm
npm install
```

### Running the Development Server

```bash
# Using Bun
bun run dev

# Or using npm
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
# Create an optimized production build
bun run build

# Preview the static export / build
bun run preview
```

---

## 📁 Project Structure

```text
FFCSketch/
├── public/                       # Static assets, PWA manifest, service workers
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── app/                      # Next.js App Router root
│   │   ├── globals.css           # Paper sketch styles, theme variables, grid lines
│   │   ├── layout.tsx            # Root layout with font injection & theme script
│   │   ├── page.tsx              # Single-page core app shell & navigation
│   │   └── paper.css             # Base PaperCSS stylesheet
│   ├── components/
│   │   ├── ffcs/                 # FFCSketch core feature components
│   │   │   ├── AppHeader.tsx     # Top navbar, table switcher, theme toggle & actions
│   │   │   ├── BlockPopover.tsx  # Interactive class block modal (swap, color, remove)
│   │   │   ├── ClashDoctor.tsx   # Clash diagnostic & resolution assistant
│   │   │   ├── ColorPicker.tsx   # Per-course custom color selector
│   │   │   ├── CompareView.tsx   # 2-table side-by-side comparison & diff
│   │   │   ├── CourseCart.tsx    # Selected courses list, credit tally & warnings
│   │   │   ├── CoursePicker.tsx  # 2-stage searchable course catalog
│   │   │   ├── CustomCourseDialog.tsx # Custom off-curriculum course creator
│   │   │   ├── Generator.tsx     # Timetable generator & priority manager
│   │   │   ├── HelpSection.tsx   # Built-in guide & FAQ accordion
│   │   │   ├── ShareDialog.tsx   # Link sharing, QR code & WhatsApp text export
│   │   │   ├── SlotFinderPopover.tsx # "What fits here?" slot finder popover
│   │   │   ├── SlotView.tsx      # Interactive slot matrix
│   │   │   ├── StatsPanel.tsx    # Weekly schedule statistics & analytics
│   │   │   ├── TimetableGrid.tsx # Weekly calendar grid (vertical & horizontal)
│   │   │   └── XlsxImportDialog.tsx # Excel/CSV import dialog with preview
│   │   └── ui/                   # Reusable UI primitives (Radix UI / Shadcn)
│   ├── data/
│   │   └── courses.json          # Pre-bundled VIT Chennai course allocations
│   ├── lib/
│   │   └── ffcs/                 # Core timetable engine & business logic
│   │       ├── backup.ts         # Full .json state export & restore validation
│   │       ├── courseData.ts     # In-memory fast query & filter engine
│   │       ├── embedded.ts       # Embedded ETH ⇄ ELA pairing validator
│   │       ├── export.ts         # PNG rasterizer & WhatsApp plain-text formatter
│   │       ├── share.ts          # Base64URL client-side share link codec
│   │       ├── slots.ts          # Slot timings, intervals & reverse cell lookup
│   │       ├── timetable.ts      # Clash detection, grid blocks & DFS generator
│   │       ├── types.ts          # TypeScript interfaces & domain models
│   │       └── xlsxImport.ts     # Fuzzy Excel header parser & validator
│   └── store/
│       └── ffcs.ts               # Zustand global store with local storage sync
├── package.json
└── tailwind.config.ts
```

---

## 📊 Excel (.xlsx) / CSV Import Specification

FFCSketch includes a fuzzy spreadsheet importer. Any Excel (`.xlsx`) or `.csv` file containing the following columns (in any order, case-insensitive) will be parsed automatically:

| Field | Accepted Header Names | Example Value | Required? |
| :--- | :--- | :--- | :---: |
| **CODE** | `CODE`, `COURSE CODE`, `SUBCODE`, `SUBJECT CODE` | `BCSE202L` | ✅ Yes |
| **TITLE** | `TITLE`, `COURSE TITLE`, `COURSE NAME`, `NAME` | `Data Structures and Algorithms` | ✅ Yes |
| **SLOT** | `SLOT`, `SLOTS` | `A1+TA1` or `L1+L2` | ✅ Yes |
| **FACULTY** | `FACULTY`, `INSTRUCTOR`, `STAFF`, `PROFESSOR` | `DR. RAMESH KUMAR` | Optional (defaults to `TBA`) |
| **TYPE** | `TYPE`, `COURSE TYPE`, `CATEGORY` | `ETH`, `ELA`, `TH`, `LO`, `SS`, `EPJ`, `PJT`, `OC` | Optional (defaults to `TH`) |
| **CREDITS** | `CREDITS`, `CREDIT`, `CR` | `3` or `1.5` | Optional (defaults to `0`) |
| **VENUE** | `VENUE`, `ROOM`, `CLASSROOM`, `LOCATION` | `AB1-503` | Optional |

> 💡 *A sample template (`ffcs-import-template.xlsx`) can be downloaded directly from the in-app Import dialog.*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>1</kbd> | Switch to **Timetable** Tab |
| <kbd>2</kbd> | Switch to **Generator** Tab |
| <kbd>3</kbd> | Switch to **Compare** Tab |
| <kbd>4</kbd> | Switch to **Slot View** Tab |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd> | **Undo** last course removal or table clear |

---

## 💡 Tips & Best Practices for FFCS Registration

1. **Prepare Multiple Drafts:** Use the table menu at the top to duplicate your main table into a *Plan B* and *Plan C*. Professors fill up in seconds during real registration!
2. **Lock Must-Have Professors:** When using the generator, use the lock icon to pin high-priority theory/lab teachers.
3. **Check Embedded Pairs:** Look for the ⚠️ warning in your cart if you registered an Embedded Theory (`ETH`) section without its corresponding Embedded Lab (`ELA`) under the same professor.
4. **Export Your Image:** Keep an offline PNG of your final timetable saved on your phone for quick reference during registration day.

---

## 📜 Disclaimer & Credits

- **Disclaimer:** FFCSketch is an independent, open-source, student-made tool created for educational convenience. It is **not affiliated with, endorsed by, or connected to the Vellore Institute of Technology (VIT)**.
- **Inspiration & Appreciation:**
  - [FFCSonTheGo](https://github.com/vatz88/FFCSonTheGo) by **vatz88**
  - [FFCS-inator](https://github.com/CodeChefVIT/ffcs) by **CodeChef-VIT**
  - [PaperCSS](https://www.getpapercss.com/) for the hand-drawn UI style

---

<p align="center">
  <b>Sketched with ❤️ for VIT Chennai students.</b><br>
  <i>Good luck with your course registration! ✏️</i>
</p>
