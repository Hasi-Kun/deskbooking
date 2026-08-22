"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { api, AdminUser, Floor, User } from "@/lib/api";

type Cache = {
  user: User | null;
  floors: Floor[];
  people: AdminUser[];
};

type Ctx = {
  data: Cache;
  /** Lädt fehlende Teile nach; bereits Geladenes wird nicht erneut geholt. */
  ensure: (need: { user?: boolean; floors?: boolean; people?: boolean }) => Promise<Cache>;
  /** Erzwingt ein Neuladen bestimmter Teile (nach Änderungen). */
  invalidate: (keys: Array<keyof Cache>) => void;
  setFloors: (floors: Floor[]) => void;
};

const empty: Cache = { user: null, floors: [], people: [] };
const AppDataContext = createContext<Ctx>({
  data: empty,
  ensure: async () => empty,
  invalidate: () => {},
  setFloors: () => {},
});

export const useAppData = () => useContext(AppDataContext);

/**
 * Hält Stammdaten über Seitenwechsel hinweg im Speicher.
 *
 * Ohne das lädt jede Seite beim Betreten erneut /auth/me, /floors und
 * /admin/users - beim Hin- und Herwechseln zwischen Übersicht, Layout und
 * Nutzern also immer wieder dieselben Daten. Der Provider sitzt im Root-Layout
 * und überlebt daher die Navigation zwischen den Seiten.
 *
 * Bewusst schlicht gehalten: keine Ablaufzeit, dafür gezieltes Invalidieren
 * nach Änderungen (z. B. neue Ebene angelegt).
 */
export default function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Cache>(empty);
  // Laufende Anfragen merken, damit zwei Seiten beim gleichzeitigen Mounten
  // nicht dieselbe Ressource doppelt anfordern.
  const inflight = useRef<Partial<Record<keyof Cache, Promise<unknown>>>>({});
  const loaded = useRef<Partial<Record<keyof Cache, boolean>>>({});
  const snapshot = useRef<Cache>(empty);
  snapshot.current = data;

  const ensure = useCallback(async (need: { user?: boolean; floors?: boolean; people?: boolean }) => {
    const jobs: Promise<void>[] = [];

    const fetchOnce = <K extends keyof Cache>(key: K, url: string) => {
      if (loaded.current[key]) return;
      if (!inflight.current[key]) {
        inflight.current[key] = api<Cache[K]>(url)
          .then((res) => {
            loaded.current[key] = true;
            setData((prev) => ({ ...prev, [key]: res }));
            snapshot.current = { ...snapshot.current, [key]: res };
          })
          .finally(() => { delete inflight.current[key]; });
      }
      jobs.push(inflight.current[key] as Promise<void>);
    };

    if (need.user) fetchOnce("user", "/api/auth/me");
    if (need.floors) fetchOnce("floors", "/api/floors");
    if (need.people) fetchOnce("people", "/api/admin/users");

    await Promise.all(jobs);
    return snapshot.current;
  }, []);

  const invalidate = useCallback((keys: Array<keyof Cache>) => {
    keys.forEach((k) => { loaded.current[k] = false; });
  }, []);

  const setFloors = useCallback((floors: Floor[]) => {
    loaded.current.floors = true;
    setData((prev) => ({ ...prev, floors }));
    snapshot.current = { ...snapshot.current, floors };
  }, []);

  return (
    <AppDataContext.Provider value={{ data, ensure, invalidate, setFloors }}>
      {children}
    </AppDataContext.Provider>
  );
}
