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
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0" aria-label="後台選單">
      {ITEMS.map(([href, label]) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-brand text-white" : "text-ink/75 hover:bg-brand-soft hover:text-brand-dark"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
