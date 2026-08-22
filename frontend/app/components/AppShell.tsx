"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { api, User, clearSessionActive } from "@/lib/api";
import { useBrand } from "./BrandProvider";
import Mark from "./Mark";
import SettingsMenu from "./SettingsMenu";
import ChatDrawer from "./ChatDrawer";
import { useTheme } from "./ThemeToggle";
import Button from "./ui/Button";

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
  const { app_name } = useBrand();
  const router = useRouter();
  const pathname = usePathname();

  const nav = [
    { href: "/dashboard", label: "Grundriss" },
    { href: "/overview", label: "Belegung" },
    ...(user?.role === "admin"
      ? [
          { href: "/admin/layout", label: "Layout" },
          { href: "/admin/users", label: "Nutzer" },
        ]
      : []),
    { href: "/account", label: "Konto" },
  ];

  async function logout() {
    clearSessionActive();
    bindUser(null);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="flex items-center gap-2.5 focus-ring rounded-lg">
              <Mark size={30} />
              <span className="font-semibold tracking-tight">{app_name}</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={[
                      "rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 focus-ring",
                      // Kein Strich mehr unter dem aktiven Tab - die Auszeichnung
                      // läuft ausschließlich über die Textfarbe: im Dunkelmodus
                      // heller/reinweiß, im Hellmodus kräftiges Schwarz statt
                      // des sonst etwas gedämpften Fließtexts.
                      active ? "text-ink font-medium dark:text-white" : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted md:inline">{user?.full_name}</span>
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
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors focus-ring",
                pathname === item.href ? "bg-raised text-ink" : "text-muted",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="gradient-bar" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {user && <ChatDrawer currentUser={user} />}
    </div>
  );
}
