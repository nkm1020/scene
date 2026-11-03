import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Scene — the next layout for chat",
  description: "Your friends as holograms, in their own voices, saying exactly what they typed — and nothing else. Built on Meta's Muse models.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { title: "Scene — the next layout for chat", description: "Text bubbles are a layout for screens. Glasses don't have one.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Scene — the next layout for chat", description: "Friends as holograms, in their own voices, saying exactly what they typed — nothing else.", images: ["/og.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#05070f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
