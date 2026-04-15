import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/app/_lib/aiSchedulerBootstrap";
import { AuthProvider } from "./_components/auth/AuthProvider";
import { CrmToaster } from "./_components/ui/CrmToaster";
import { SocketProvider } from "./_components/realtime/SocketProvider";
import { NotificationProvider } from "./_components/notifications/NotificationProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "나우카 고객관리",
  description: "나우카 고객관리",
  icons: {
    icon: "/images/nowcar-ai-logo.png",
    shortcut: "/images/nowcar-ai-logo.png",
    apple: "/images/nowcar-ai-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <AuthProvider>
          <SocketProvider>
            <NotificationProvider>
              {children}
              <CrmToaster />
            </NotificationProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
