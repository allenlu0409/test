import Link from "next/link";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="約好 首頁">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill={light ? "#ffffff" : "#0b6b53"} />
        <path d="M8 14.5l4 4 8-9" fill="none" stroke={light ? "#0b6b53" : "#ffffff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="21.5" cy="20.5" r="2" fill="#f2b84b" />
      </svg>
      <span className={`text-lg font-bold tracking-wide ${light ? "text-white" : "text-ink"}`}>約好</span>
    </Link>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "已確認", cls: "bg-brand-soft text-brand-dark" },
  completed: { label: "已完成", cls: "bg-ink/8 text-ink" },
  cancelled: { label: "已取消", cls: "bg-danger-soft text-danger" },
  no_show: { label: "未到", cls: "bg-sun-soft text-[#8a5a00]" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.confirmed;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
