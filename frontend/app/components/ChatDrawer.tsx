"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ChatMessage, Conversation, User } from "@/lib/api";

type DirectoryUser = { id: string; full_name: string; name_style?: string; name_style_color?: string };
import StyledName from "./StyledName";
import Avatar from "./ui/Avatar";

const POLL_MS = 4000;

type View = { kind: "global" } | { kind: "dm"; userId: string; userName: string };

/**
 * Chat als ausklappbares Seitenpanel statt eigener Seite - so bleibt der
 * Kontext (Grundriss, Layout, ...) im Hintergrund sichtbar und erreichbar.
 * Aktualisierung per Polling (alle 4s), kein WebSocket-Server nötig.
 */
export default function ChatDrawer({ currentUser }: { currentUser: User }) {
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "global" });
  const [globalMsgs, setGlobalMsgs] = useState<ChatMessage[]>([]);
  const [dmMsgs, setDmMsgs] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [showPeople, setShowPeople] = useState(false);

  const lastGlobalAt = useRef<string | null>(null);
  const lastDmAt = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const pollUnread = useCallback(async () => {
    try {
      const res = await api<{ unread: number }>("/api/chat/unread-count");
      setTotalUnread(res.unread);
    } catch { /* still, kein Fehlerbanner fürs Hintergrund-Polling */ }
  }, []);

  const pollGlobal = useCallback(async () => {
    try {
      const q = lastGlobalAt.current ? `?after=${encodeURIComponent(lastGlobalAt.current)}` : "";
      const res = await api<ChatMessage[]>(`/api/chat/global${q}`);
      if (res.length) {
        setGlobalMsgs((prev) => [...prev, ...res]);
        lastGlobalAt.current = res[res.length - 1].created_at;
        if (viewRef.current.kind === "global") scrollToBottom();
      }
    } catch { /* Polling-Fehler nicht anzeigen, nächster Versuch folgt */ }
  }, []);

  const pollDm = useCallback(async (userId: string) => {
    try {
      const q = lastDmAt.current ? `?after=${encodeURIComponent(lastDmAt.current)}` : "";
      const res = await api<ChatMessage[]>(`/api/chat/dm/${userId}${q}`);
      if (res.length) {
        setDmMsgs((prev) => [...prev, ...res]);
        lastDmAt.current = res[res.length - 1].created_at;
        scrollToBottom();
      }
      void pollUnread();
    } catch { /* siehe oben */ }
  }, [pollUnread]);

  // Ungelesen-Zähler unabhängig vom geöffneten Zustand im Hintergrund pflegen
  useEffect(() => {
    void pollUnread();
    const id = window.setInterval(pollUnread, POLL_MS * 2);
    return () => window.clearInterval(id);
  }, [pollUnread]);

  // Beim Öffnen bzw. Wechsel der Ansicht laden + Polling starten
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function init() {
      if (view.kind === "global") {
        const res = await api<ChatMessage[]>("/api/chat/global");
        if (cancelled) return;
        setGlobalMsgs(res);
        lastGlobalAt.current = res.at(-1)?.created_at ?? null;
      } else {
        const res = await api<ChatMessage[]>(`/api/chat/dm/${view.userId}`);
        if (cancelled) return;
        setDmMsgs(res);
        lastDmAt.current = res.at(-1)?.created_at ?? null;
      }
      const convs = await api<Conversation[]>("/api/chat/conversations");
      if (!cancelled) setConversations(convs);
      scrollToBottom();
    }
    void init();

    const id = window.setInterval(() => {
      if (view.kind === "global") void pollGlobal();
      else void pollDm(view.userId);
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open, view, pollGlobal, pollDm]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      if (view.kind === "global") {
        const msg = await api<ChatMessage>("/api/chat/global", { method: "POST", body: JSON.stringify({ body }) });
        setGlobalMsgs((prev) => [...prev, msg]);
        lastGlobalAt.current = msg.created_at;
      } else {
        const msg = await api<ChatMessage>(`/api/chat/dm/${view.userId}`, { method: "POST", body: JSON.stringify({ body }) });
        setDmMsgs((prev) => [...prev, msg]);
        lastDmAt.current = msg.created_at;
      }
      scrollToBottom();
    } catch {
      setDraft(body); // bei Fehler den Entwurf nicht verlieren
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!showPeople || directory.length > 0) return;
    api<DirectoryUser[]>("/api/chat/directory").then(setDirectory).catch(() => {});
  }, [showPeople, directory.length]);

  function openDm(userId: string, userName: string) {
    setDmMsgs([]);
    lastDmAt.current = null;
    setView({ kind: "dm", userId, userName });
    setShowPeople(false);
  }

  const messages = view.kind === "global" ? globalMsgs : dmMsgs;

  return (
    <>
      {/* Auslöser: fester Knopf unten rechts, mit Ungelesen-Badge */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat öffnen"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full
                   border border-line bg-surface shadow-xl transition-all duration-200
                   hover:scale-105 focus-ring"
      >
        <ChatIcon />
        {totalUnread > 0 && !open && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full
                           bg-danger px-1 text-[10px] font-semibold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-5 z-40 flex h-[520px] w-[340px] animate-scale-in flex-col
                     overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          {/* Kopf: Tabs + Personenwahl */}
          <div className="flex items-center gap-1 border-b border-line px-3 py-2.5">
            <button
              onClick={() => setView({ kind: "global" })}
              className={[
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 focus-ring",
                view.kind === "global" ? "text-accent-ink" : "text-muted hover:text-ink hover:bg-raised",
              ].join(" ")}
              style={view.kind === "global" ? { background: "var(--accent)" } : undefined}
            >
              Global
            </button>
            <button
              onClick={() => setShowPeople((v) => !v)}
              className={[
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 focus-ring",
                view.kind === "dm" ? "text-accent-ink" : "text-muted hover:text-ink hover:bg-raised",
              ].join(" ")}
              style={view.kind === "dm" ? { background: "var(--accent)" } : undefined}
            >
              {view.kind === "dm" ? view.userName : "Direkt"}
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              className="ml-auto rounded-md px-1.5 text-muted transition-colors hover:text-ink focus-ring"
            >
              ✕
            </button>
          </div>

          {/* Personenauswahl für Direktnachrichten */}
          {showPeople && (
            <div className="max-h-56 overflow-y-auto border-b border-line thin-scroll animate-fade-in">
              {conversations.length > 0 && (
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Zuletzt
                </p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.user_id}
                  onClick={() => openDm(c.user_id, c.user_name)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors
                             duration-150 hover:bg-raised focus-ring"
                >
                  <Avatar name={c.user_name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      <StyledName name={c.user_name} style={c.user_name_style} color={c.user_name_style_color} />
                    </p>
                    <p className="truncate text-[11px] text-muted">{c.last_message}</p>
                  </div>
                  {c.unread > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] text-white">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))}
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Alle Kolleg:innen
              </p>
              {directory
                .filter((p) => !conversations.some((c) => c.user_id === p.id))
                .map((p) => (
                <button
                  key={p.id}
                  onClick={() => openDm(p.id, p.full_name)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors
                             duration-150 hover:bg-raised focus-ring"
                >
                  <Avatar name={p.full_name} size={28} />
                  <span className="truncate text-xs">
                    <StyledName name={p.full_name} style={p.name_style} color={p.name_style_color} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Nachrichtenverlauf */}
          <div ref={scrollRef} className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="mt-8 text-center text-xs text-muted">
                {view.kind === "global" ? "Noch keine Nachrichten im globalen Kanal." : "Schreib die erste Nachricht."}
              </p>
            )}
            {messages.map((m) => {
              const isMine = m.sender_id === currentUser.id;
              return (
                <div key={m.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && <Avatar name={m.sender_name} size={26} />}
                  <div className={`max-w-[76%] ${isMine ? "items-end" : ""} flex flex-col`}>
                    {!isMine && view.kind === "global" && (
                      <span className="mb-0.5 px-1 text-[10px] text-muted">
                        <StyledName name={m.sender_name} style={m.sender_name_style} color={m.sender_name_style_color} />
                      </span>
                    )}
                    <div
                      className={[
                        "rounded-2xl px-3 py-1.5 text-sm leading-snug transition-all duration-200",
                        isMine ? "text-accent-ink" : "bg-raised text-ink",
                      ].join(" ")}
                      style={isMine ? { background: "var(--accent)" } : undefined}
                    >
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Eingabe */}
          <div className="border-t border-line p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                placeholder="Nachricht schreiben…"
                rows={1}
                className="max-h-24 w-full resize-none rounded-lg bg-raised px-3 py-2 text-sm
                           placeholder:text-muted/60 focus-ring"
              />
              <button
                onClick={send}
                disabled={!draft.trim() || sending}
                aria-label="Senden"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-accent-ink
                           transition-all duration-200 disabled:opacity-40 focus-ring active:scale-90"
                style={{ background: "var(--accent)" }}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}
