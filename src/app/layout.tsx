import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Raise · Investor pipeline intelligence",
  description: "Which investors are worth contacting this week, with evidence from the last 30 days.",
};

// Panchang (headlines) and General Sans (data and paragraphs) are served by Fontshare. One request per family,
// because their API drops the second family when two are combined.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=panchang@400,500,600,700,800&display=swap" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
