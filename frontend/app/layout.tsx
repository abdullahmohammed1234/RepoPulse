import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { ClientLayout } from "@/components/ClientLayout";
import { navItems } from "@/config/navItems";

export const metadata: Metadata = {
  title: "RepoPulse - AI-Powered Repository Analytics",
  description: "Analyze GitHub repositories with AI-powered insights on PR risks, file hotspots, and contributor anomalies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <ClientLayout navItems={navItems}>
            {children}
          </ClientLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
