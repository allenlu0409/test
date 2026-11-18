import Link from "next/link";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-black">找不到這個頁面</h1>
      <p className="mt-2 text-sm text-muted">連結可能打錯了，或是店家已經更換預約頁網址。</p>
      <Link href="/" className="btn btn-primary mt-6">
        回首頁
      </Link>
    </main>
  );
}
