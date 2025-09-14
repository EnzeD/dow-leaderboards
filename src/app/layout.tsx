import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DoW:DE Top-100 Leaderboard",
  description: "Top-100 players for Dawn of War: Definitive Edition leaderboards",
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
      <body className="bg-gray-100 min-h-screen font-exo-2">{children}</body>
    </html>
  );
}