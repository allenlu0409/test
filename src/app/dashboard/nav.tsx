"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
  ["/dashboard/help", "使用說明"],
] as const;

export function Nav() {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);

  // 手機上是一條可以左右捲的分頁列：換頁後把目前的分頁捲到看得見的位置
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[aria-current=page]");
    const nav = ref.current;
    if (active && nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [path]);

  return (
    <div className="relative">
      <nav ref={ref} className="flex gap-1 overflow-x-auto px-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-5" aria-label="後台選單">
        {ITEMS.map(([href, label]) => {
          const active = href === "/dashboard" ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm transition-colors lg:min-h-9 lg:border-b-0 lg:border-l-2 lg:pl-4 ${
                active ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {/* 右緣漸淡：提示右邊還有分頁可以捲 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent lg:hidden" aria-hidden="true" />
    </div>
  );
}
