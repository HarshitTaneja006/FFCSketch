import type { Metadata, Viewport } from "next";
import { Neucha } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ServiceWorkerRegister from "@/components/ffcs/ServiceWorkerRegister";

const neucha = Neucha({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-neucha",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FFCSketch — Sketch Your Semester",
  description:
    "Plan your VIT FFCS course registration with a hand-drawn twist. Search courses, visualize clash-free timetables, auto-generate schedules by priority, and share with friends. Built for VIT Chennai.",
  keywords: [
    "VIT", "FFCS", "FFCSketch", "timetable", "planner", "course registration",
    "VIT Chennai", "slots", "clash-free",
  ],
  authors: [{ name: "FFCSketch" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "FFCSketch",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffe08a" },
    { media: "(prefers-color-scheme: dark)", color: "#201d26" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Applies the persisted night-sketch theme before first paint (no flash).
  const themeScript = `try{if(JSON.parse(localStorage.getItem("ffcs-planner-v1")||"{}")?.state?.theme==="night"){document.documentElement.classList.add("night-sketch")}}catch(e){}`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${neucha.variable} antialiased ffcs-body`}>
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
