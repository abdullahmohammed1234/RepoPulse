"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      className={cn("flex items-center space-x-1 text-sm", className)}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center space-x-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-1 h-4 w-4 text-muted-foreground"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Hook to automatically generate breadcrumbs from the current path
export function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();
  
  if (!pathname) return [];

  // Remove query params and split path
  const pathSegments = pathname
    .split("/")
    .filter((segment) => segment.length > 0);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
  ];

  let currentPath = "";
  
  for (const segment of pathSegments) {
    currentPath += `/${segment}`;
    
    // Format the label (capitalize, replace hyphens with spaces)
    const label = segment
      .replace(/-/g, " ")
      .replace(/\[.*\]/g, "Details") // Handle dynamic segments like [id]
      .replace(/\b\w/g, (char) => char.toUpperCase());

    breadcrumbs.push({
      label,
      href: currentPath,
    });
  }

  return breadcrumbs;
}
