import type { Metadata, Viewport } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Decision AI", template: "%s · Decision AI" },
  description:
    "Evidence-based decisions: Decision AI researches the web, verifies every claim against the exact passage it came from, and explains its recommendation with a tamper-evident audit trail.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="h-full bg-paper font-sans text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
