import type { Metadata } from "next";
import "./globals.css";
import BrandProvider from "./components/BrandProvider";
import { ThemeProvider } from "./components/ThemeToggle";
import AppDataProvider from "./components/AppDataProvider";

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
            <AppDataProvider>{children}</AppDataProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
