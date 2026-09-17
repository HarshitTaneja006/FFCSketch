"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { ClipboardList, Copy, Loader2, QrCode, Share2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { timetableToText } from "@/lib/ffcs/export";
import type { CartEntry, Campus } from "@/lib/ffcs/types";

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  /** Share URL once created — null until the backend responds. */
  shareUrl: string | null;
  /** Called with the (trimmed) timetable name when the user confirms. */
  onConfirm: (name: string) => void;
  loading: boolean;
  /** Available immediately — powers "copy as text" without creating a link first. */
  tableName: string;
  entries: CartEntry[];
  campus: Campus;
}

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(45, 41, 38, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const CARD: CSSProperties = {
  position: "relative",
  width: "min(460px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "var(--card)",
  border: "3px solid var(--ffcs-ink)",
  borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
  boxShadow: "3px 4px 0 var(--shadow-ink)",
  padding: "18px 20px 20px",
};

const INPUT: CSSProperties = {
  width: "100%",
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "8px 4px 10px 5px / 5px 10px 4px 8px",
  background: "var(--input)",
  padding: "7px 10px",
  fontSize: "0.95rem",
  fontFamily: "inherit",
  color: "var(--ffcs-ink)",
};

const BTN: CSSProperties = {
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
  background: "var(--accent)",
  padding: "7px 16px",
  fontFamily: "inherit",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "var(--on-accent)",
  cursor: "pointer",
  boxShadow: "2px 3px 0 rgba(45, 41, 38, 0.35)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const CLOSE_BTN: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 12,
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid var(--ffcs-ink)",
  borderRadius: "12px 4px 10px 5px / 5px 10px 4px 12px",
  background: "var(--input)",
  color: "var(--ffcs-ink)",
  cursor: "pointer",
  padding: 0,
};

/** Hand-drawn paper modal for creating + copying a share link (or a text paste). */
export function ShareDialog({
  open,
  onClose,
  shareUrl,
  onConfirm,
  loading,
  tableName,
  entries,
  campus,
}: ShareDialogProps) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [textCopied, setTextCopied] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  /* Escape key closes the dialog */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* generate a scannable QR (always ink-on-white — safest for phone cameras in both themes) */
  useEffect(() => {
    if (!shareUrl) return;
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#2d2926ff", light: "#fffef9ff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrData(url);
      })
      .catch(() => {
        if (!cancelled) setQrData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  if (!open) return null;

  /* "Copied!" hint only makes sense with a live URL (self-resets when URL is cleared on close) */
  const showCopied = copied && shareUrl !== null;
  /* QR is only shown against a live URL (stale data ignored when URL cleared) */
  const visibleQr = shareUrl ? qrData : null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // clipboard permission blocked — select the text so the user can copy manually
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }
  };

  const handleCopyText = async () => {
    if (entries.length === 0) {
      toast({ title: "Add some courses first! 📭" });
      return;
    }
    const text = timetableToText(entries, campus, name.trim() || tableName);
    try {
      await navigator.clipboard.writeText(text);
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 2600);
      toast({ title: "Timetable copied as text 📋", description: "Paste it into any chat!" });
    } catch {
      // fallback: legacy execCommand so feature works on older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setTextCopied(true);
        setTimeout(() => setTextCopied(false), 2600);
        toast({ title: "Timetable copied as text 📋" });
      } catch {
        toast({ title: "Copy blocked by browser", variant: "destructive" });
      }
      ta.remove();
    }
  };

  const handleSubmit = () => {
    if (loading) return;
    onConfirm(name.trim());
  };

  return (
    <div style={OVERLAY} onClick={onClose} role="presentation">
      <div
        style={CARD}
        role="dialog"
        aria-modal="true"
        aria-label="Share this timetable"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          style={CLOSE_BTN}
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>

        <h3 style={{ margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
          <Share2 size={18} /> Share this timetable
        </h3>
        <p className="ffcs-label" style={{ margin: "0 0 14px" }}>
          Snapshot · unique link · read-only
        </p>

        {shareUrl === null ? (
          <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <label
              className="ffcs-label"
              htmlFor="ffcs-share-name"
              style={{ display: "block", marginBottom: 4 }}
            >
              Timetable name
            </label>
            <input
              id="ffcs-share-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sem 5 Plan A"
              disabled={loading}
              autoFocus
              style={INPUT}
            />
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <button type="submit" className="btn" style={BTN} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Creating link…
                  </>
                ) : (
                  "Create share link"
                )}
              </button>
              {loading && (
                <span style={{ fontSize: "0.85rem", color: "var(--label-ink)" }}>Saving snapshot…</span>
              )}
            </div>
          </form>

          {/* copy as text — works without creating a link */}
          <div
            className="text-share"
            style={{
              marginTop: 16,
              border: "2px dashed var(--label-ink)",
              borderRadius: "12px 7px 13px 8px / 8px 13px 7px 12px",
              padding: "10px 12px",
              background: "var(--flex-bg)",
            }}
          >
            <div
              className="ffcs-label"
              style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}
            >
              <ClipboardList size={14} /> more of a texter?
            </div>
            <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "var(--muted-ink)" }}>
              Copy the whole week as a plain-text list — perfect for WhatsApp groups and
              hostel roommates. Uses the name above if you typed one.
            </p>
            <button
              type="button"
              className={`btn text-share-btn${textCopied ? " done" : ""}`}
              onClick={handleCopyText}
              disabled={loading}
            >
              {textCopied ? (
                <>✓ copied — go paste it!</>
              ) : (
                <>
                  <ClipboardList size={14} /> Copy timetable as text
                </>
              )}
            </button>
          </div>
          </>
        ) : (
          <div>
            <div className="ffcs-label" style={{ marginBottom: 4 }}>
              Share link — anyone with it can view
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={urlInputRef}
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{ ...INPUT, flex: 1, fontSize: "0.85rem" }}
              />
              <button type="button" className="btn" style={BTN} onClick={handleCopy}>
                <Copy size={15} /> Copy
              </button>
            </div>
            <div style={{ marginTop: 8, minHeight: 18, fontSize: "0.85rem" }}>
              {showCopied ? (
                <span style={{ color: "var(--good-strong)", fontWeight: 700 }}>Copied!</span>
              ) : (
                <span style={{ color: "var(--label-ink)" }}>
                  It does not auto-update — share again after edits.
                </span>
              )}
            </div>

            {/* QR code in a hand-drawn frame */}
            <div
              className="qr-frame"
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 14,
                border: "2.5px dashed var(--label-ink)",
                borderRadius: "14px 8px 12px 9px / 9px 12px 8px 14px",
                padding: "12px 14px",
                background: "var(--flex-bg)",
              }}
            >
              {visibleQr ? (
                <img
                  src={visibleQr}
                  alt="QR code linking to this shared timetable"
                  width={104}
                  height={104}
                  style={{
                    display: "block",
                    border: "2px solid var(--ffcs-ink)",
                    borderRadius: "10px 5px 12px 6px",
                    background: "#fffef9",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 104,
                    height: 104,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid var(--ffcs-ink)",
                    borderRadius: "10px 5px 12px 6px",
                    background: "#fffef9",
                    flexShrink: 0,
                  }}
                >
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  className="ffcs-label"
                  style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}
                >
                  <QrCode size={14} /> scan me!
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted-ink)" }}>
                  Point a phone camera at this to open the timetable — no typing,
                  no app install. Works from paper printouts too. 📱
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
