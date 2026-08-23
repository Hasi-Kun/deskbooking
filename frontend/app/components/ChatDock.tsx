"use client";
import { useCallback, useEffect, useState } from "react";
import { api, User } from "@/lib/api";
import GlobalChatPanel from "./GlobalChatPanel";

const POLL_MS = 8000;

/**
 * Der Team-Chat saß vorher als dauerhaft 320px breite Spalte NEBEN dem
 * Grundriss - das nimmt permanent Platz weg, den man auf dem Hauptbildschirm
 * eigentlich fürs Layout braucht. Jetzt: ein schmaler Reiter am rechten Rand
 * (immer sichtbar, damit der Chat auffindbar bleibt), der bei Klick als
 * Overlay über den Inhalt gleitet - der Grundriss selbst bleibt dadurch
 * standardmäßig auf voller Breite.
 */
export default function ChatDock({ currentUser }: { currentUser: User }) {
  const [open, setOpen] = useState(false);
  // Badge NUR für eigene Erwähnungen (@Name), nicht für den ganzen
  // ungelesenen Kanal - siehe /api/chat/mentions/unread-count.
  const [mentionCount, setMentionCount] = useState(0);

  const pollMentions = useCallback(async () => {
    try {
      const res = await api<{ unread: number }>("/api/chat/mentions/unread-count");
      setMentionCount(res.unread);
    } catch {}
  }, []);

  useEffect(() => {
    void pollMentions();
    const id = window.setInterval(pollMentions, POLL_MS);
    return () => window.clearInterval(id);
  }, [pollMentions]);

  // Beim Öffnen gelten Erwähnungen als gesehen (GlobalChatPanel ruft
  // /api/chat/mentions/seen selbst beim Mounten auf) - Badge hier sofort
  // optimistisch ausblenden, statt auf den nächsten Poll zu warten.
  useEffect(() => {
    if (open) setMentionCount(0);
  }, [open]);

  // Escape schließt, wie bei den übrigen Overlays im Projekt.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Reiter - immer sichtbar, mittig am rechten Bildschirmrand */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Team-Chat schließen" : "Team-Chat öffnen"}
        className={[
          "fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl2 border border-r-0",
          "border-line bg-surface py-3 pl-2.5 pr-1.5 shadow-lg transition-all duration-200",
          "hover:bg-raised focus-ring",
          open ? "translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100",
        ].join(" ")}
        style={{ writingMode: "vertical-rl" }}
      >
        <ChatIcon />
        <span className="rotate-180 text-xs font-medium text-ink">Team-Chat</span>
        {/* Notification-Badge - nur für Erwähnungen der eigenen Person */}
        {mentionCount > 0 && (
          <span
            className="absolute -left-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center
                       rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
            style={{ writingMode: "horizontal-tb" }}
            aria-label={`${mentionCount} neue Erwähnung${mentionCount === 1 ? "" : "en"}`}
          >
            {mentionCount > 9 ? "9+" : mentionCount}
          </span>
        )}
      </button>

      {/* Overlay + Panel */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Team-Chat"
        className={[
          "fixed right-0 top-0 z-40 h-full w-full max-w-[360px] border-l border-line bg-surface shadow-2xl",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Der Schließen-Button lebt jetzt IN GlobalChatPanel's eigener
            Kopfzeile (neben "Chat leeren") statt als zusätzliches, separat
            positioniertes Element darüber - vorher überlappten sich beide. */}
        {open && <GlobalChatPanel currentUser={currentUser} onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className="shrink-0 text-accent" style={{ writingMode: "horizontal-tb" }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
