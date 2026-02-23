import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { ClientLayout } from "@/components/ClientLayout";
import { QueryProvider } from "@/lib/queryProvider";
import { Providers } from "@/components/Providers";
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
          <QueryProvider>
            <ClientLayout navItems={navItems}>
              <Providers>
                {children}
              </Providers>
            </ClientLayout>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
