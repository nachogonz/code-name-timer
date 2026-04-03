import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skip-Bo Voice Timer",
  description: "Two-team Skip-Bo timer with optional voice commands",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
