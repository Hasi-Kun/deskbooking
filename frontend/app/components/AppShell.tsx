"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import { useBrand } from "./BrandProvider";
import Mark from "./Mark";
import SettingsMenu from "./SettingsMenu";
import Button from "./ui/Button";

/** Gemeinsame Kopfzeile aller angemeldeten Seiten. */
export default function AppShell({
  user, children,
}: { user: User | null; children: React.ReactNode }) {
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
                      "relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 focus-ring",
                      active ? "text-ink" : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                    {active && (
                      <span
                        className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
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
    </div>
  );
}
