import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pairwise — autonomous dating agent",
  description: "A local-first browser agent that evaluates profiles and executes preference-driven dating decisions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
