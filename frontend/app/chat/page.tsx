"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ChatMessage, Conversation, DirectoryUser, User } from "@/lib/api";
import AppShell from "../components/AppShell";
import { useAppData } from "../components/AppDataProvider";
import Avatar from "../components/ui/Avatar";
import StyledName from "../components/StyledName";
import { Skeleton, ChatSkeleton } from "../components/ui/Skeleton";

const POLL_MS = 4000;

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffMin < 60 * 24) return `vor ${Math.round(diffMin / 60)} Std.`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <AppShell user={null}><ChatSkeleton /></AppShell>
    }>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, ensure } = useAppData();
  const [user, setUser] = useState<User | null>(data.user);
  const [loading, setLoading] = useState(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showList, setShowList] = useState(true); // Mobile: Liste vs. Thread

  useEffect(() => {
    (async () => {
      try {
        const cache = await ensure({ user: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        setUser(cache.user);
        const [convs, dir] = await Promise.all([
          api<Conversation[]>("/api/chat/conversations"),
          api<DirectoryUser[]>("/api/chat/directory"),
        ]);
        setConversations(convs);
        setDirectory(dir);
        const pre = searchParams.get("with");
        if (pre) { setActiveId(pre); setShowList(false); }
        else if (convs[0]) setActiveId(convs[0].user_id);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshConversations = useCallback(async () => {
    try { setConversations(await api<Conversation[]>("/api/chat/conversations")); } catch {}
  }, []);

  const directoryOnly = useMemo(
    () => directory.filter((d) => !conversations.some((c) => c.user_id === d.id)),
    [directory, conversations]
  );

  const [query, setQuery] = useState("");
  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => c.user_name.toLowerCase().includes(q)) : conversations;
  }, [conversations, query]);
  const filteredDirectoryOnly = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? directoryOnly.filter((d) => d.full_name.toLowerCase().includes(q)) : directoryOnly;
  }, [directoryOnly, query]);

  const active = conversations.find((c) => c.user_id === activeId)
    ?? (activeId ? directory.find((d) => d.id === activeId) : undefined);

  if (loading) {
    return (
      <AppShell user={user}>
        <ChatSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted">Direktnachrichten mit Kolleg:innen.</p>
      </div>

      <div className="mt-4 flex h-[600px] overflow-hidden rounded-2xl border border-line bg-surface">
        {/* Konversationsliste */}
        <div className={[
          "flex w-full shrink-0 flex-col border-r border-line md:flex md:w-72",
          showList ? "flex" : "hidden",
        ].join(" ")}>
          {(conversations.length + directoryOnly.length) > 6 && (
            <div className="relative shrink-0 border-b border-line p-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Person suchen…"
                className="w-full rounded-lg border border-line bg-raised py-1.5 pl-8 pr-3 text-xs
                           placeholder:text-muted/60 focus-ring"
              />
            </div>
          )}
          <div className="thin-scroll flex-1 overflow-y-auto">
            {conversations.length === 0 && directoryOnly.length === 0 && (
              <p className="p-4 text-center text-xs text-muted">Noch keine Kolleg:innen verfügbar.</p>
            )}
            {query && filteredConversations.length === 0 && filteredDirectoryOnly.length === 0 && (
              <p className="p-4 text-center text-xs text-muted">Keine Treffer für „{query}“.</p>
            )}
            {filteredConversations.map((c) => (
              <ConvRow
                key={c.user_id} active={c.user_id === activeId}
                name={c.user_name} style={c.user_name_style} color={c.user_name_style_color}
                avatar={c.user_avatar_url} online={c.user_online} lastSeenAt={c.user_last_seen_at}
                sub={c.last_message} time={timeAgo(c.last_at)} unread={c.unread}
                onClick={() => { setActiveId(c.user_id); setShowList(false); }}
              />
            ))}
            {filteredDirectoryOnly.length > 0 && (
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Neue Nachricht an
              </p>
            )}
            {filteredDirectoryOnly.map((d) => (
              <ConvRow
                key={d.id} active={d.id === activeId}
                name={d.full_name} style={d.name_style} color={d.name_style_color}
                avatar={d.avatar_url} online={d.online} lastSeenAt={d.last_seen_at} sub="Noch kein Verlauf"
                onClick={() => { setActiveId(d.id); setShowList(false); }}
              />
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className={["flex min-w-0 flex-1 flex-col", showList ? "hidden md:flex" : "flex"].join(" ")}>
          {active && user ? (
            <Thread
              key={"user_id" in active ? active.user_id : active.id}
              otherId={"user_id" in active ? active.user_id : active.id}
              otherName={"user_id" in active ? active.user_name : active.full_name}
              otherOnline={"user_id" in active ? active.user_online : active.online}
              currentUser={user}
              onBack={() => setShowList(true)}
              onSent={refreshConversations}
            />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-muted">
              Wähle links eine Unterhaltung aus.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ConvRow({
  active, name, style, color, avatar, online, lastSeenAt, sub, time, unread, onClick,
}: {
  active: boolean; name: string; style?: string; color?: string; avatar?: string | null; online?: boolean;
  lastSeenAt?: string | null; sub: string; time?: string; unread?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 border-b border-line/60 px-3.5 py-2.5 text-left transition-colors",
        active ? "bg-raised" : "hover:bg-raised/60",
      ].join(" ")}
    >
      <Avatar name={name} src={avatar} size={36} online={online} lastSeenAt={lastSeenAt} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink">
            <StyledName name={name} style={style} color={color} />
          </span>
          {time && <span className="shrink-0 text-[10px] text-muted">{time}</span>}
        </div>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      {!!unread && (
        <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full
                         bg-danger px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function Thread({
  otherId, otherName, otherOnline, currentUser, onBack, onSent,
}: {
  otherId: string; otherName: string; otherOnline?: boolean; currentUser: User; onBack: () => void; onSent: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastAt = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (smooth = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  };

  const poll = useCallback(async () => {
    try {
      const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      const res = await api<ChatMessage[]>(`/api/chat/dm/${otherId}${q}`);
      if (res.length) {
        setMessages((prev) => [...prev, ...res]);
        lastAt.current = res[res.length - 1].created_at;
        scrollToBottom();
        onSent();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    lastAt.current = null;
    (async () => {
      try {
        const res = await api<ChatMessage[]>(`/api/chat/dm/${otherId}`);
        if (cancelled) return;
        setMessages(res);
        lastAt.current = res.at(-1)?.created_at ?? null;
        scrollToBottom(false);
        onSent(); // eigene ungelesene Nachrichten wurden hier serverseitig als gelesen markiert
      } catch {}
    })();
    const id = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId, poll]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const msg = await api<ChatMessage>(`/api/chat/dm/${otherId}`, { method: "POST", body: JSON.stringify({ body }) });
      setMessages((prev) => [...prev, msg]);
      lastAt.current = msg.created_at;
      scrollToBottom();
      onSent();
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <button onClick={onBack} aria-label="Zurück zur Liste" className="focus-ring rounded-lg p-0.5 md:hidden">
          <BackIcon />
        </button>
        <p className="truncate text-sm font-medium text-ink">{otherName}</p>
        <span className={["h-2 w-2 shrink-0 rounded-full", otherOnline ? "bg-free" : "bg-muted/50"].join(" ")}
              title={otherOnline ? "Online" : "Offline"} aria-label={otherOnline ? "Online" : "Offline"} />
      </div>

      <div ref={scrollRef} className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-muted">Noch kein Verlauf mit {otherName}.</p>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === currentUser.id;
          return (
            <div key={m.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
              <Avatar name={m.sender_name} src={m.sender_avatar_url} size={24} online={m.sender_online} />
              <div className={`max-w-[75%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <span className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[10px] text-muted">
                  <span>{isMine ? "Du" : otherName}</span>
                  <span className="text-muted/70">{timeShort(m.created_at)}</span>
                </span>
                <div
                  className={[
                    "rounded-2xl px-3 py-1.5 text-sm leading-snug",
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

      <div className="border-t border-line p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={`Nachricht an ${otherName}…`}
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
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
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
