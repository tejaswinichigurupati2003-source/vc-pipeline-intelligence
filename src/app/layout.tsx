import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VC Pipeline Intelligence",
  description: "Which VCs are worth contacting this week, with evidence from the last 30 days.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
