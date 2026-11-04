import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
// the room's face: a grotesque with a width axis, condensed for the edge print along the film
const film = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-film", display: "swap" });

export const metadata: Metadata = {
  title: "Scene: your group chat, performed",
  description: "Sit at the table with your friends as clay figurines, in their own voices, saying exactly what they typed and nothing else. Built on Meta's Muse models, SAM 3.1 and SAM 3D.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { title: "Scene", description: "Your group chat, performed by your friends' figurines, in their own voices.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Scene", description: "Your group chat, performed by your friends' figurines, in their own voices.", images: ["/og.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0e0d0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${film.variable}`}>
      <body>{children}</body>
    </html>
  );
}
