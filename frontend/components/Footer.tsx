"use client";

import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background/95">
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand and Copyright */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-primary"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span className="font-bold text-lg">RepoPulse</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {currentYear} RepoPulse. All rights reserved.
            </p>
          </div>

          {/* About Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">About</h3>
            <p className="text-sm text-muted-foreground">
              AI-powered repository analytics that provides insights on PR risks, file hotspots, 
              and contributor anomalies.
            </p>
          </div>

          {/* Links */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Quick Links</h3>
            <nav className="flex flex-wrap gap-4">
              <Link 
                href="/" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Home
              </Link>
              <Link 
                href="/admin/analytics" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Analytics
              </Link>
              <Link 
                href="/benchmark" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Benchmark
              </Link>
              <Link 
                href="/simulations/history" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Simulation History
              </Link>
            </nav>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-center text-xs text-muted-foreground">
            Powered by advanced AI analysis • Built with Next.js
          </p>
        </div>
      </div>
    </footer>
  );
}
