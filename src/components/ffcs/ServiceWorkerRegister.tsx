"use client";

/**
 * ServiceWorkerRegister — registers /sw.js (offline fallback for navigations).
 * The worker is deliberately conservative: it only precaches the offline page
 * + icons, passes /_next/* and /api/* straight to the network, and falls back
 * to /offline.html when a navigation fails (offline).
 */

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort — the app works fine without it */
      });
    };
    if (document.readyState === "complete") onLoad();
    else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);
  return null;
}
