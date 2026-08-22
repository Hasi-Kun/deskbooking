"use client";
import { useBrand } from "./BrandProvider";

/** Zeigt das konfigurierte Logo, oder - falls keins hinterlegt ist - ein
 *  neutrales, aus dem Namen abgeleitetes Monogramm. Kein festes Branding im Code. */
export default function Mark({ size = 36 }: { size?: number }) {
  const { app_name, logo_url } = useBrand();
  if (logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo_url} alt={app_name} style={{ height: size, width: "auto" }} className="rounded-md" />;
  }
  const initial = (app_name || "D").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{ height: size, width: size, background: "var(--accent)" }}
      className="rounded-lg flex items-center justify-center text-white font-semibold"
    >
      {initial}
    </div>
  );
}
