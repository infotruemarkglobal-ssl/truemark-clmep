import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Truemark Global",
    default: "Truemark Global — Certification Platform",
  },
  description:
    "ISO/IEC 17024 compliant personnel certification, learning management and examination platform.",
  icons: {
    icon: [
      { url: "/icon", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icon", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Calling headers() opts this layout—and every page nested inside it—into
  // dynamic rendering. Without this, Next.js may statically pre-render pages at
  // build time before any request exists, producing HTML with no nonce on script
  // tags. The proxy generates a per-request nonce and sets it in the CSP response
  // header, so if the page is static the nonce in the header won't match the
  // (absent) nonce in the script tags, blocking all JavaScript.
  await headers();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head />
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
