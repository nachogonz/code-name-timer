import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Skip-Bo voice timer",
  description: "Two-team Skip-Bo timer with pre-game thinking time and voice commands",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
