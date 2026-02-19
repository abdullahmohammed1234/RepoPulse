import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-16 items-center px-4">
              <div className="mr-4 flex">
                <a href="/" className="mr-6 flex items-center space-x-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 text-primary"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                  <span className="hidden font-bold sm:inline-block text-lg">
                    RepoPulse
                  </span>
                </a>
              </div>
              <nav className="flex items-center space-x-6 text-sm font-medium">
                <a
                  href="/"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Dashboard
                </a>
                <a
                  href="/benchmark"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Benchmark
                </a>
                <a
                  href="/simulations/history"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  History
                </a>
                <a
                  href="/admin/prompt-experiments"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Experiments
                </a>
                <a
                  href="/admin/workflows"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Workflows
                </a>
                <a
                  href="/admin/analytics"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Analytics
                </a>
                <a
                  href="/admin/webhooks"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Webhooks
                </a>
                <a
                  href="/team"
                  className="transition-colors hover:text-primary/80 text-foreground/80"
                >
                  Team
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
