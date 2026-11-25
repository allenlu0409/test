"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/dashboard", "總覽"],
  ["/dashboard/bookings", "預約"],
  ["/dashboard/calendar", "行事曆"],
  ["/dashboard/customers", "顧客"],
  ["/dashboard/services", "服務項目"],
  ["/dashboard/staff", "服務人員"],
  ["/dashboard/hours", "營業時間"],
  ["/dashboard/settings", "店家設定"],
  ["/dashboard/billing", "方案與帳單"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-5" aria-label="後台選單">
      {ITEMS.map(([href, label]) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors lg:border-b-0 lg:border-l-2 lg:py-1.5 lg:pl-4 ${
              active ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
