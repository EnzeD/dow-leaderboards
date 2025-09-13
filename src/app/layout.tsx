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
      <body className="bg-gray-100 min-h-screen">{children}</body>
    </html>
  );
}