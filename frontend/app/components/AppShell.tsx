"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { api, User, clearSessionActive } from "@/lib/api";
import SettingsMenu from "./SettingsMenu";
import Avatar from "./ui/Avatar";
import { useTheme } from "./ThemeToggle";
import Button from "./ui/Button";

const UNREAD_POLL_MS = 8000;
const HEARTBEAT_MS = 25000;

/** Gemeinsame Kopfzeile aller angemeldeten Seiten. */
export default function AppShell({
  user, children,
}: { user: User | null; children: React.ReactNode }) {
  const { bindUser } = useTheme();
  // Sobald bekannt ist, wer angemeldet ist, gilt dessen gespeicherte Vorliebe.
  useEffect(() => {
    // Absichtlich NICHTS tun, solange der Nutzer noch lädt (user ist dann
    // kurzzeitig null, auch wenn die Person tatsächlich angemeldet ist).
    // bindUser(null) würde sonst bedingungslos auf die Systemeinstellung
    // zurückfallen und den gespiegelten/gespeicherten Wert ignorieren - das
    // war der zweite, unabhängige Flacker-Punkt: pre-paint-Skript setzt
    // korrekt "dunkel", die Ladephase kippt kurz auf "hell" (System), und
    // erst danach stellt sich die echte Kontoeinstellung wieder her.
    if (user?.id) bindUser(user.id);
  }, [user?.id, bindUser]);
  const router = useRouter();
  const pathname = usePathname();

  // Ungelesene Direktnachrichten fuers Badge am "Chat"-Menüpunkt - unabhängig
  // davon, ob man den Chat gerade geöffnet hat, damit man neue DMs auch von
  // jeder anderen Seite aus mitbekommt.
  const [unread, setUnread] = useState(0);
  const pollUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api<{ unread: number }>("/api/chat/unread-count");
      setUnread(res.unread);
    } catch { /* still, kein Fehlerbanner fürs Hintergrund-Polling */ }
  }, [user]);
  useEffect(() => {
    if (!user) return;
    void pollUnread();
    const id = window.setInterval(pollUnread, UNREAD_POLL_MS);
    return () => window.clearInterval(id);
  }, [user, pollUnread]);

  // Online-Status fuer den Chat: solange eine Seite offen ist, alle ~25s
  // einen Heartbeat senden (siehe User.online im Backend).
  useEffect(() => {
    if (!user) return;
    const ping = () => { api("/api/auth/heartbeat", { method: "POST" }).catch(() => {}); };
    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [user]);

  const nav = [
    { href: "/dashboard", label: "Grundriss" },
    { href: "/overview", label: "Belegung" },
    ...(user?.role === "admin"
      ? [
          { href: "/admin/layout", label: "Layout" },
          { href: "/admin/users", label: "Nutzer" },
          { href: "/admin/audit-log", label: "Aktivität" },
        ]
      : []),
    { href: "/chat", label: "Chat", badge: unread },
    { href: "/account", label: "Konto" },
  ];

  async function logout() {
    clearSessionActive();
    bindUser(null);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  return (
    <div
      className="min-h-screen"
      style={user?.mine_uses_accent ? { ["--mine-active" as any]: "var(--accent)", ["--mine-active-ink" as any]: "var(--accent-ink)" } : undefined}
    >
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-5">
            <nav className="hidden sm:flex items-center gap-1">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={[
                      "relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 focus-ring",
                      // Kein Strich mehr unter dem aktiven Tab - die Auszeichnung
                      // läuft ausschließlich über die Textfarbe: im Dunkelmodus
                      // heller/reinweiß, im Hellmodus kräftiges Schwarz statt
                      // des sonst etwas gedämpften Fließtexts.
                      active ? "text-ink font-medium dark:text-white" : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                    {!!item.badge && <NavBadge count={item.badge} />}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <Link href="/account" className="hidden items-center gap-2 rounded-lg px-1.5 py-1 md:flex
                                                 hover:bg-raised transition-colors focus-ring">
                <span className="text-sm text-muted">{user.full_name}</span>
                <Avatar name={user.full_name} src={user.avatar_url} size={26} />
              </Link>
            )}
            <SettingsMenu isAdmin={user?.role === "admin"} />
            <Button size="sm" onClick={logout}>Abmelden</Button>
          </div>
        </div>
        {/* Mobile Navigation */}
        <nav className="flex sm:hidden items-center gap-1 border-t border-line px-4 py-2 overflow-x-auto thin-scroll">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={[
                "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors focus-ring",
                pathname === item.href ? "bg-raised text-ink" : "text-muted",
              ].join(" ")}
            >
              {item.label}
              {!!item.badge && <NavBadge count={item.badge} />}
            </Link>
          ))}
        </nav>
        <div className="gradient-bar" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

/** Rotes Badge am Nav-Punkt "Chat" mit der Anzahl ungelesener Nachrichten
 *  (deckelt bei 9+, damit das Kästchen nicht aus der Form geraet). */
function NavBadge({ count }: { count: number }) {
  return (
    <span
      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full
                 bg-danger px-1 text-[10px] font-semibold leading-none text-white"
      aria-label={`${count} ungelesen`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
