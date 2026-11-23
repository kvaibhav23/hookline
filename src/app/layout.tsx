import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Nav } from "@/components/Nav";
import "./globals.css";


export const metadata: Metadata = {
  title: "Hookline — prospect to personalised draft",
  description: "Researches a B2B prospect, finds a real hook, writes a draft and proves every claim. A human approves before anything is sent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <Nav />
        </Suspense>
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
