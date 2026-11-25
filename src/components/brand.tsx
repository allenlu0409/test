import Link from "next/link";

/** 商標：一顆刻著「約好」的印章 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="YUEHAO 約好，回首頁">
      <span className="seal h-8 px-1.5 text-[15px]" aria-hidden="true">
        約好
      </span>
      <span className="text-xs tracking-[0.2em] text-muted">YUEHAO</span>
    </Link>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "已確認", cls: "text-brand bg-brand-soft" },
  completed: { label: "已完成", cls: "text-ink/70 bg-white" },
  cancelled: { label: "已取消", cls: "text-danger bg-white line-through" },
  no_show: { label: "未到", cls: "text-[#6b4a00] bg-sun-soft" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.confirmed;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
