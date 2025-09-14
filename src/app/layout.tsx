import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dawn of War: Definitive Edition Leaderboards",
  description: "Live leaderboards and player statistics for Dawn of War: Definitive Edition",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-neutral-900 min-h-screen font-exo-2" style={{
        backgroundImage: 'linear-gradient(rgba(25, 25, 25, 0.85), rgba(15, 15, 15, 0.85)), url(/background.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}>{children}</body>
    </html>
  );
}