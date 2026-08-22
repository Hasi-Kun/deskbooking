"use client";
import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import AlertDialog from "./ui/AlertDialog";
import {
  subscribeSessionExpired, getSessionExpiredSnapshot,
  getSessionExpiredServerSnapshot, resetSessionExpired,
} from "@/lib/session-store";

/**
 * Zeigt einen Hinweis, sobald die Sitzung tatsächlich abgelaufen ist (siehe
 * lib/session-store.ts für das Race-Condition-freie Speichermodell). Muss
 * aktiv bestätigt werden - kein Wegklicken, denn jede weitere Aktion würde
 * ohnehin an der fehlenden Sitzung scheitern.
 */
export default function SessionExpiredProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const expired = useSyncExternalStore(
    subscribeSessionExpired, getSessionExpiredSnapshot, getSessionExpiredServerSnapshot
  );

  // KEIN Ausschluss nach aktuellem Pfad: der 401, der die Sitzung als
  // abgelaufen meldet, ist meist genau der Grund, warum die Seite selbst
  // gerade eben nach /login umgeleitet hat. Würde man hier "nicht auf /login
  // zeigen" prüfen, unterdrückt das ausgerechnet den Hinweis in dem Moment,
  // den er erklären soll - der Nutzer landet kommentarlos auf der
  // Anmeldeseite und weiß nicht, warum. Stattdessen wird das Flag bei jedem
  // erfolgreichen Login zurückgesetzt (siehe login/page.tsx), damit es nicht
  // über eine neue Sitzung hinweg bestehen bleibt.
  const show = expired;
  void pathname;

  return (
    <>
      {children}
      <AlertDialog
        open={show}
        title="Sitzung abgelaufen"
        description="Aus Sicherheitsgründen wurdest du automatisch abgemeldet. Bitte melde dich erneut an, um fortzufahren."
        actionLabel="Erneut anmelden"
        onAction={() => {
          resetSessionExpired();
          router.replace("/login");
        }}
      />
    </>
  );
}
