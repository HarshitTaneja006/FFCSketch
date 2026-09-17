/**
 * FFCSketch — share links (fully client-side)
 *
 * With the backend removed, share links now carry the timetable payload
 * INSIDE the URL itself:  …/?s=<base64url(json)>
 *
 * Payload entries are stored as compact identity tuples
 * [code, type, slot, faculty, title?, credits?] — on import the dataset is
 * consulted first (restores venue/id), falling back to the tuple values for
 * custom/imported courses that aren't in the dataset.
 */

import type { CartEntry, CourseSection, CourseType } from "./types";
import { findSectionByIdentity } from "./courseData";

interface ShareEntryTuple {
  c: string; // code
  t: string; // type
  s: string; // slot
  f: string; // faculty
  /** present only for sections NOT resolvable from the dataset (custom courses) */
  ti?: string; // title
  cr?: number; // credits
  v?: string; // venue
}

export interface SharePayload {
  /** table name */
  n: string;
  /** owner name (optional) */
  o: string | null;
  /** campus — always "chennai" in this build (kept for payload compatibility) */
  x: "chennai";
  e: ShareEntryTuple[];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build a share URL that embeds the whole table */
export function buildShareUrl(entries: CartEntry[], name: string, owner: string | null): string {
  const payload: SharePayload = {
    n: name || "Shared Timetable",
    o: owner || null,
    x: "chennai",
    e: entries.map((e) => ({
      c: e.code,
      t: e.type,
      s: e.slot,
      f: e.faculty,
      ti: e.title,
      cr: e.credits,
      v: e.venue,
    })),
  };
  const json = JSON.stringify(payload);
  const encoded = toBase64Url(new TextEncoder().encode(json));
  return `${window.location.origin}/?s=${encoded}`;
}

/** Extract a share token from a pasted URL (or a bare token) */
export function extractShareToken(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const fromUrl = s.match(/[?&]s=([A-Za-z0-9_-]+)/) || s.match(/#s=([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[A-Za-z0-9_-]{16,}$/.test(s)) return s; // bare token (min length guards typos)
  return null;
}

/** Decode a share token into displayable sections (dataset-resolved where possible) */
export function decodeShareToken(token: string):
  | { name: string; owner: string | null; entries: CourseSection[] }
  | null {
  // DoS guard: share payloads are a handful of KB — refuse absurd inputs.
  if (!token || token.length > 100_000) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(token));
    if (json.length > 200_000) return null;
    const payload = JSON.parse(json) as SharePayload;
    if (!payload || !Array.isArray(payload.e) || payload.e.length === 0) return null;
    if (payload.e.length > 200) return null;
    const entries: CourseSection[] = [];
    let synthetic = -Date.now();
    for (const t of payload.e) {
      if (!t || typeof t.c !== "string") continue;
      const resolved = findSectionByIdentity(t.c, t.s, t.f, t.t);
      if (resolved) {
        entries.push(resolved);
      } else {
        // custom / unknown course — carry the tuple values as-is (length-capped)
        entries.push({
          id: synthetic--,
          code: t.c.slice(0, 24),
          title: (t.ti || t.c).slice(0, 200),
          type: (t.t as CourseType) || "TH",
          credits: typeof t.cr === "number" ? t.cr : 0,
          slot: (t.s || "NIL").slice(0, 40),
          faculty: (t.f || "TBA").slice(0, 120),
          venue: t.v?.slice(0, 60),
        });
      }
    }
    if (entries.length === 0) return null;
    return {
      name: (payload.n || "Shared Timetable").slice(0, 80),
      owner: (payload.o || null)?.slice(0, 80) || null,
      entries,
    };
  } catch {
    return null;
  }
}
