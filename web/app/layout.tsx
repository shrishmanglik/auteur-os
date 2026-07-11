import type { Metadata, Viewport } from "next";
import "./web-shell.css";

export const metadata: Metadata = {
  title: "AUTEUR Studio",
  description: "AI production workspace for treatments, screenplays, storyboards, continuity, and generation-ready prompt packets.",
  applicationName: "AUTEUR Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AUTEUR" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090a0c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
