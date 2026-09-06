import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BackLogoutModal } from "@/components/back-logout-modal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DealFlow360",
  description: "B2B Sales Operations and Quote-to-Cash Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <BackLogoutModal />
        {children}
      </body>
    </html>
  );
}
