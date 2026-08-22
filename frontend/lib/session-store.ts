/**
 * Speicher für "Sitzung abgelaufen" - bewusst auf localStorage aufgebaut statt
 * auf einer reinen JS-Variable.
 *
 * Grund: der Übergang zur Login-Seite nach einem 401 läuft über
 * `router.replace()`. Ist die Zielseite nicht vorab geladen (kein Prefetch),
 * kann Next.js daraus eine HARTE Navigation machen (kompletter Dokument-
 * Neuladevorgang) statt einer weichen Client-Transition. Bei einer harten
 * Navigation wird JEDES JS-Modul frisch neu ausgeführt - eine reine
 * In-Memory-Variable wäre in genau diesem Moment wieder auf ihren
 * Ausgangswert zurückgesetzt, obwohl die Meldung ja gerade JETZT gebraucht
 * wird. localStorage übersteht das, weil es vom Browser (nicht vom
 * JS-Modul) verwaltet wird.
 *
 * Für die Reaktivität INNERHALB desselben Tabs (falls keine harte Navigation
 * stattfindet) dient ein zusätzliches, selbst ausgelöstes Fenster-Ereignis -
 * das native "storage"-Ereignis feuert nämlich nur in ANDEREN Tabs, nie im
 * Tab, der die Änderung selbst vorgenommen hat.
 */
const KEY = "deskbooking-session-expired";
const INTERNAL_EVENT = "deskbooking:session-expired-internal";

function safeSet(value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, value);
  } catch {
    /* z.B. Safari privater Modus - dann bleibt es eben nur In-Tab-reaktiv */
  }
}

export function notifySessionExpired() {
  safeSet("1");
  window.dispatchEvent(new Event(INTERNAL_EVENT));
}

export function resetSessionExpired() {
  safeSet(null);
  window.dispatchEvent(new Event(INTERNAL_EVENT));
}

export function subscribeSessionExpired(listener: () => void) {
  window.addEventListener(INTERNAL_EVENT, listener);
  // "storage" feuert nur bei Änderungen aus ANDEREN Tabs - als Ergänzung,
  // nicht als Ersatz für das interne Ereignis.
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(INTERNAL_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function getSessionExpiredSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function getSessionExpiredServerSnapshot() {
  return false;
}
