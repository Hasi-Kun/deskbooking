"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, AdminUser, User } from "@/lib/api";
import AppShell from "../../components/AppShell";
import { useAppData } from "../../components/AppDataProvider";
import Button from "../../components/ui/Button";
import Dialog from "../../components/ui/Dialog";
import { ListSkeleton } from "../../components/ui/Skeleton";

export default function UserAdmin() {
  const router = useRouter();
  const { ensure, invalidate } = useAppData();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [query, setQuery] = useState("");

  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "user" });
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setUsers(await api<AdminUser[]>("/api/admin/users"));
    // Nutzerliste hat sich geändert - der Layout-Builder braucht sie frisch
    invalidate(["people"]);
  }

  useEffect(() => {
    (async () => {
      try {
        const cache = await ensure({ user: true, people: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        if (cache.user.role !== "admin") { router.replace("/dashboard"); return; }
        setMe(cache.user);
        setUsers(cache.people);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (e: unknown) => setError((e as ApiError)?.message || "Aktion fehlgeschlagen");

  async function act(fn: () => Promise<void>, successMessage?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await fn();
      await reload();
      if (successMessage) setNotice(successMessage);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AppShell user={me}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Nutzerverwaltung</h1>
          <p className="mt-0.5 text-sm text-muted">{users.length} Konten · {users.filter((u) => u.is_active).length} aktiv</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="w-44 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus-ring"
          />
          <Button variant="primary" onClick={() => setCreateOpen(true)}>Konto anlegen</Button>
        </div>
      </div>

      {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
      {notice && <Banner tone="ok" onClose={() => setNotice(null)}>{notice}</Banner>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.id}
                 className="group/user flex flex-wrap items-center gap-3 rounded-xl2 border border-line
                            bg-surface p-3 transition-all duration-200 hover:border-accent/40 hover:shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold
                              text-accent-ink transition-transform duration-200 group-hover/user:scale-105"
                   style={{ background: "var(--accent)" }}>
                {u.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{u.full_name}</span>
                  {u.role === "admin" && <Tag>Admin</Tag>}
                  {u.totp_enabled && <Tag>2FA</Tag>}
                  {!u.is_active && <Tag tone="muted">Deaktiviert</Tag>}
                </div>
                <p className="truncate text-xs text-muted">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {u.id !== me?.id && (
                  <Button size="sm" disabled={busy}
                          onClick={() => act(() => api(`/api/admin/users/${u.id}/role`, {
                            method: "PATCH",
                            body: JSON.stringify({ role: u.role === "admin" ? "user" : "admin" }),
                          }).then(() => {}), "Rolle geändert")}>
                    {u.role === "admin" ? "Zu Nutzer" : "Zu Admin"}
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => setResetFor(u)}>Passwort</Button>
                {u.totp_enabled && (
                  <Button size="sm" disabled={busy}
                          onClick={() => act(() => api(`/api/admin/users/${u.id}/disable-2fa`, { method: "POST" }).then(() => {}),
                                             "2FA zurückgesetzt")}>
                    2FA zurücksetzen
                  </Button>
                )}
                {u.id !== me?.id && (
                  u.is_active ? (
                    <Button size="sm" variant="danger" disabled={busy}
                            onClick={() => act(() => api(`/api/admin/users/${u.id}/deactivate`, { method: "PATCH" }).then(() => {}),
                                               "Konto deaktiviert")}>
                      Deaktivieren
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy}
                            onClick={() => act(() => api(`/api/admin/users/${u.id}/activate`, { method: "PATCH" }).then(() => {}),
                                               "Konto aktiviert")}>
                      Aktivieren
                    </Button>
                  )
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted">Keine Treffer.</p>}
        </div>
      )}

      {/* Konto anlegen */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Konto anlegen"
        description="Die Person kann das Passwort nach der ersten Anmeldung selbst ändern."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button variant="primary" loading={busy}
                    onClick={() => act(async () => {
                      await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
                      setForm({ email: "", full_name: "", password: "", role: "user" });
                      setCreateOpen(false);
                    }, "Konto angelegt")}>
              Anlegen
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <Input label="E-Mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Startpasswort (mind. 10 Zeichen)" type="text" value={form.password}
                 onChange={(v) => setForm({ ...form, password: v })} />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Rolle</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus-ring">
              <option value="user">Nutzer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>
      </Dialog>

      {/* Passwort zuruecksetzen */}
      <Dialog
        open={!!resetFor}
        onClose={() => { setResetFor(null); setNewPassword(""); }}
        title={`Passwort für ${resetFor?.full_name ?? ""}`}
        description="Alle offenen Sitzungen dieser Person werden dabei abgemeldet."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setResetFor(null); setNewPassword(""); }}>Abbrechen</Button>
            <Button variant="primary" loading={busy}
                    onClick={() => act(async () => {
                      await api(`/api/admin/users/${resetFor!.id}/reset-password`, {
                        method: "POST", body: JSON.stringify({ new_password: newPassword }),
                      });
                      setResetFor(null); setNewPassword("");
                    }, "Passwort gesetzt")}>
              Passwort setzen
            </Button>
          </>
        }
      >
        <Input label="Neues Passwort (mind. 10 Zeichen)" type="text" value={newPassword} onChange={setNewPassword} />
      </Dialog>
    </AppShell>
  );
}

function Tag({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "muted" }) {
  return (
    <span className={[
      "rounded-full px-2 py-0.5 text-[10px] font-medium",
      tone === "accent" ? "bg-accent/15 text-accent" : "bg-raised text-muted",
    ].join(" ")}>{children}</span>
  );
}

function Input({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus-ring" />
    </div>
  );
}

function Banner({ children, tone, onClose }: {
  children: React.ReactNode; tone: "danger" | "ok"; onClose: () => void;
}) {
  return (
    <div role="alert" className={[
      "mb-3 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm animate-fade-in",
      tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-free/30 bg-free/10 text-free",
    ].join(" ")}>
      <span>{children}</span>
      <button onClick={onClose} aria-label="Schließen" className="focus-ring rounded">✕</button>
    </div>
  );
}
