import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Scene: your group chat, performed",
  description: "Sit at the table with your friends as clay figurines, in their own voices, saying exactly what they typed and nothing else. Built on Meta's Muse models, SAM 3.1 and SAM 3D.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { title: "Scene", description: "Your group chat, performed by your friends' figurines, in their own voices.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Scene", description: "Your group chat, performed by your friends' figurines, in their own voices.", images: ["/og.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#d9d1c4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
