import type { Metadata, Viewport } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import { Exo_2 } from "next/font/google";
import "./globals.css";
import { AccountProvider } from "./_components/AccountProvider";
import { LivePresence } from "./_components/LivePresence";
import { auth0 } from "@/lib/auth0";

// Auth0 is configured at runtime when the app is built for the VPS.
export const dynamic = "force-dynamic";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();

  return (
    <html lang="en">
      <body className={`${exo2.className} bg-neutral-900 min-h-screen`} style={{
        backgroundImage: 'linear-gradient(rgba(25, 25, 25, 0.85), rgba(15, 15, 15, 0.85)), url(/background.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}>
        <Auth0Provider user={session?.user ?? undefined}>
          <AccountProvider initialUser={session?.user ?? null}>
            {children}
          </AccountProvider>
        </Auth0Provider>
        <LivePresence />
      </body>
    </html>
  );
}
