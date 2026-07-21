import type { Metadata } from "next";
import { Cormorant_Garamond, Lora } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "600"],
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AFAR Music — Build an AI artist, not just a track",
  description:
    "Build an AI artist from a prompt, shape their Creative DNA, and hear the songs that define them. Every artist and song on AFAR is AI-generated, shaped by a human.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${lora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <nav className="nav">
          <Link href="/" className="nav-brand">
            AFAR Music
          </Link>
          <Link href="/">The roster</Link>
          <Link href="/create" className="btn btn-primary">
            Create an artist
          </Link>
        </nav>
        <main className="flex-1">{children}</main>
        <footer
          className="text-center"
          style={{ borderTop: "1px solid var(--color-divider)", padding: "var(--space-4)" }}
        >
          <p className="kicker" style={{ color: "var(--color-neutral-600)", margin: 0 }}>
            Every artist and song on AFAR is AI-generated, shaped by a human.
          </p>
        </footer>
      </body>
    </html>
  );
}
