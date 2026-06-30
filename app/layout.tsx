import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spotify User Review Engine",
  description: "In-depth analysis of user reviews for Spotify",
  icons: { icon: "/brand/spotify-app-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        <noscript>
          <p
            style={{
              background: "#eb5540",
              color: "#fff",
              padding: "0.75rem 1rem",
              textAlign: "center",
            }}
          >
            JavaScript is required for Ask and search. Enable JS and reload.
          </p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
