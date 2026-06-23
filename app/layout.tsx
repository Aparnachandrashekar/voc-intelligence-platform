import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice of Customer Intelligence",
  description: "AI-powered feedback aggregation and analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
