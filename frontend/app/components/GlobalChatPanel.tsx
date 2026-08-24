"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ChatMessage, DirectoryUser, User } from "@/lib/api";
import StyledName from "./StyledName";
import Avatar from "./ui/Avatar";
import AlertDialog from "./ui/AlertDialog";

const POLL_MS = 4000;

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Zerlegt den Nachrichtentext an "@Vollständiger Name"-Vorkommen (nur für
 *  Namen, die tatsächlich in mentionedNames stehen) und hebt sie hervor -
 *  rein kosmetisch, die eigentliche Benachrichtigung läuft serverseitig über
 *  mentioned_user_ids, nicht über diesen Text-Parse. */
function renderBody(body: string, mentionedNames: string[]) {
  if (mentionedNames.length === 0) return body;
  const pattern = mentionedNames.map((n) => `@${n}`).sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let rest = body;
  let key = 0;
  outer: while (rest.length) {
    for (const token of pattern) {
      if (rest.startsWith(token)) {
        parts.push(<span key={key++} className="font-semibold text-accent">{token}</span>);
        rest = rest.slice(token.length);
        continue outer;
      }
    }
    const nextAt = rest.indexOf("@", 1);
    const chunk = nextAt === -1 ? rest : rest.slice(0, nextAt);
    parts.push(<span key={key++}>{chunk}</span>);
    rest = nextAt === -1 ? "" : rest.slice(chunk.length);
  }
  return parts;
}

/**
 * Globaler Kanal als andockbares Panel (siehe ChatDock). Zeigt bei JEDER
 * Nachricht Avatar, Name und Uhrzeit - vorher nur bei fremden Nachrichten.
 */
export default function GlobalChatPanel({ currentUser, onClose }: { currentUser: User; onClose?: () => void }) {
  const isAdmin = currentUser.role === "admin";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionIds, setMentionIds] = useState<Record<string, string>>({}); // "@Name" -> id
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lastAt = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (smooth = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  };

  const poll = useCallback(async () => {
    try {
      const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      const res = await api<ChatMessage[]>(`/api/chat/global${q}`);
      if (res.length) {
        setMessages((prev) => [...prev, ...res]);
        lastAt.current = res[res.length - 1].created_at;
        scrollToBottom();
      }
    } catch { /* Polling-Fehler nicht anzeigen, nächster Versuch folgt */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res] = await Promise.all([
          api<ChatMessage[]>("/api/chat/global"),
          api<DirectoryUser[]>("/api/chat/directory").then(setDirectory).catch(() => {}),
        ]);
        if (cancelled) return;
        setMessages(res);
        lastAt.current = res.at(-1)?.created_at ?? null;
        setLoaded(true);
        scrollToBottom(false);
      } catch { setLoaded(true); }
      // Panel ist jetzt sichtbar - eigene Erwähnungen gelten als gesehen.
      api("/api/chat/mentions/seen", { method: "POST" }).catch(() => {});
    })();
    const id = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [poll]);

  const directoryById = useMemo(() => new Map(directory.map((d) => [d.id, d])), [directory]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return directory.filter((d) => d.full_name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, directory]);

  function onDraftChange(value: string) {
    setDraft(value.slice(0, 2000));
    const at = value.lastIndexOf("@");
    if (at === -1 || /\s/.test(value.slice(at + 1))) { setMentionQuery(null); return; }
    setMentionQuery(value.slice(at + 1));
  }

  function pickMention(person: DirectoryUser) {
    const at = draft.lastIndexOf("@");
    const token = `@${person.full_name}`;
    const next = `${draft.slice(0, at)}${token} `;
    setDraft(next);
    setMentionIds((m) => ({ ...m, [token]: person.id }));
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    setMentionQuery(null);
    // Nur IDs mitschicken, deren "@Name"-Text auch tatsächlich noch im
    // gesendeten Text vorkommt (falls zwischenzeitlich gelöscht/editiert).
    const ids = Object.entries(mentionIds).filter(([token]) => body.includes(token)).map(([, id]) => id);
    try {
      const msg = await api<ChatMessage>("/api/chat/global", {
        method: "POST", body: JSON.stringify({ body, mentioned_user_ids: ids }),
      });
      setMessages((prev) => [...prev, msg]);
      lastAt.current = msg.created_at;
      setMentionIds({});
      scrollToBottom();
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistisch
    try {
      await api(`/api/chat/messages/${id}`, { method: "DELETE" });
    } catch { /* keine Ruecknahme - naechstes Polling holt den echten Stand */ }
  }

  async function clearAll() {
    setClearing(true);
    try {
      await api("/api/chat/global", { method: "DELETE" });
      setMessages([]);
      lastAt.current = null;
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-3">
        <div className="flex items-center gap-2">
          <ChatIcon />
          <p className="text-sm font-medium text-ink">Team-Chat</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && messages.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[11px] text-muted underline decoration-dotted transition-colors hover:text-danger focus-ring rounded"
            >
              Chat leeren
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted
                         transition-colors hover:bg-raised hover:text-ink focus-ring"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loaded && messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-muted">Noch keine Nachrichten im globalen Kanal.</p>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === currentUser.id;
          const mentionedNames = (m.mentioned_user_ids ?? [])
            .map((id) => directoryById.get(id)?.full_name ?? (id === currentUser.id ? currentUser.full_name : null))
            .filter((n): n is string => !!n);
          const iMentioned = (m.mentioned_user_ids ?? []).includes(currentUser.id);
          return (
            <div key={m.id} className={`group/msg flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
              <Avatar name={m.sender_name} src={m.sender_avatar_url} size={26} online={m.sender_online} />
              <div className={`max-w-[78%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <span className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[10px] text-muted">
                  <StyledName name={isMine ? "Du" : m.sender_name} style={isMine ? undefined : m.sender_name_style}
                              color={isMine ? undefined : m.sender_name_style_color} />
                  <span className="text-muted/70">{timeShort(m.created_at)}</span>
                </span>
                <div className="flex items-center gap-1">
                  <div
                    className={[
                      "rounded-2xl px-3 py-1.5 text-sm leading-snug transition-all duration-200",
                      isMine ? "text-accent-ink" : "bg-raised text-ink",
                      iMentioned && !isMine ? "ring-2 ring-accent/60" : "",
                    ].join(" ")}
                    style={isMine ? { background: "var(--accent)" } : undefined}
                  >
                    {renderBody(m.body, mentionedNames)}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteMessage(m.id)}
                      aria-label="Nachricht löschen"
                      title="Nachricht löschen"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted opacity-0
                                 transition-opacity hover:text-danger focus-ring group-hover/msg:opacity-100"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative border-t border-line p-2.5">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-2.5 right-2.5 mb-1 max-h-40 overflow-y-auto thin-scroll
                          rounded-lg border border-line bg-surface p-1 shadow-xl animate-scale-in">
            {mentionMatches.map((p) => (
              <button
                key={p.id}
                onClick={() => pickMention(p)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-raised focus-ring"
              >
                <Avatar name={p.full_name} src={p.avatar_url} size={20} online={p.online} />
                <StyledName name={p.full_name} style={p.name_style} color={p.name_style_color} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && mentionMatches.length === 0) { e.preventDefault(); void send(); }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            placeholder="Nachricht an alle… (@ erwähnt jemanden)"
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

      <AlertDialog
        open={confirmClear}
        title="Gesamten Chat leeren?"
        description="Alle Nachrichten im globalen Kanal werden für alle unwiderruflich gelöscht."
        actionLabel="Leeren"
        actionBusy={clearing}
        onAction={clearAll}
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
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
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}
