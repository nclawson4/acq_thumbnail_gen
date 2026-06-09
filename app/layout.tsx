import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Thumbnail Studio — AI Thumbnails for Interview Videos",
  description:
    "Generate YouTube thumbnails for two-host interview videos using vision-LLM crop detection and Gemini image generation. Open-source, Vercel-hosted.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[color:var(--border)] bg-background/95 backdrop-blur sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
              Thumbnail Studio
            </Link>
            <nav className="flex items-center gap-6 text-sm text-[color:var(--muted-foreground)]">
              <Link href="/generate" className="hover:text-foreground">
                Generate
              </Link>
              <Link href="/styles" className="hover:text-foreground">
                Styles
              </Link>
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
              <a
                href="https://github.com/nclawson4/acq_thumbnail_gen"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[color:var(--border)] py-6 text-sm text-[color:var(--muted-foreground)]">
          <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3">
            <span>
              Built with Next.js, Vercel Workflow DevKit, Gemini, Claude.
            </span>
            <span>
              Open source on{" "}
              <a
                href="https://github.com/nclawson4/acq_thumbnail_gen"
                className="underline"
              >
                GitHub
              </a>
              .
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
