import type { Metadata } from "next";
import "./globals.css";
import BrandProvider from "./components/BrandProvider";
import { ThemeProvider } from "./components/ThemeToggle";
import AppDataProvider from "./components/AppDataProvider";
import SessionExpiredProvider from "./components/SessionExpiredProvider";
import ContextMenuGuard from "./components/ContextMenuGuard";

export const metadata: Metadata = {
  title: "Deskbooking",
  description: "Arbeitsplatzbuchung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Theme VOR dem ersten Paint setzen, sonst blitzt kurz das helle Design auf. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('deskbooking-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <ThemeProvider>
          <BrandProvider>
            <AppDataProvider>
              <SessionExpiredProvider>{children}</SessionExpiredProvider>
            </AppDataProvider>
          </BrandProvider>
        </ThemeProvider>
        <ContextMenuGuard />
      </body>
    </html>
  );
}
