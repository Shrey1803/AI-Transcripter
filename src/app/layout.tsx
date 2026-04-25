import type { Metadata } from "next";
import "./globals.css";
import { ConstellationBackground } from "@/components/constellation-background";

export const metadata: Metadata = {
  title: "Audio Transcript Admin",
  description: "Admin-only audio transcription dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ConstellationBackground />
        {children}
      </body>
    </html>
  );
}
