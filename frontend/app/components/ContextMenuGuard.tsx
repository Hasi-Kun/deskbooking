"use client";
import { useEffect } from "react";

/**
 * Rechtsklick soll überall ein normales Werkzeug sein, das NICHTS tut -
 * außer im Layout-Editor, wo es das Eigenschaften-Panel öffnet. Statt an
 * jeder einzelnen Stelle im Code ein onContextMenu={e=>e.preventDefault()}
 * zu verteilen (und leicht eine Stelle zu vergessen), sitzt die Sperre hier
 * zentral an der Wurzel - der Editor-Canvas markiert sich selbst mit
 * data-allow-context-menu, alles andere bleibt gesperrt.
 *
 * Capture-Phase (dritter Parameter "true"): der Handler läuft VOR den
 * React-eigenen onContextMenu-Handlern in FloorCanvas. Findet er die
 * Ausnahme-Markierung, tut er nichts und lässt das Ereignis normal
 * weiterlaufen - der Editor kann sein eigenes preventDefault() + Popup wie
 * gehabt selbst übernehmen.
 */
export default function ContextMenuGuard() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-allow-context-menu]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler, true);
    return () => document.removeEventListener("contextmenu", handler, true);
  }, []);
  return null;
}
