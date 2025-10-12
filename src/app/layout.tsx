import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Exo_2 } from "next/font/google";
import "./globals.css";

const exo2 = Exo_2({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dawn of War: Definitive Edition Leaderboards",
  description: "Live leaderboards and player statistics for Dawn of War: Definitive Edition",
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${exo2.className} bg-neutral-900 min-h-screen`}
        style={{
          backgroundImage: 'linear-gradient(rgba(25, 25, 25, 0.85), rgba(15, 15, 15, 0.85)), url(/background.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-neutral-800/70 bg-neutral-950/70 py-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 text-sm text-neutral-400 md:flex-row md:items-center md:justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Dawn of War Leaderboards
              </p>
              <nav className="flex flex-wrap items-center gap-4">
                <Link
                  href="/seo"
                  className="transition-colors hover:text-neutral-200"
                >
                  SEO Hub
                </Link>
              </nav>
            </div>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
