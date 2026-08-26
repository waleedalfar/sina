import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/* IBM Plex carries the whole system: Sans for prose, Mono for every label,
   identifier, status and number. The mono face is not decorative here —
   hashes, sequence numbers and event types have to line up column-wise to
   be readable as a register. */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sina — AI Governance Console",
  description: "Operate, evaluate, and govern AI systems inside a regulated healthcare environment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-base text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
