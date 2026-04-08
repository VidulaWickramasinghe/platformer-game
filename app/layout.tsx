import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Super Web Platformer",
  description: "A deluxe browser platformer built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}