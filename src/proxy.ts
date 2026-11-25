// 進入點流量管控：對公開 API 依 IP 限流，擋掉爬蟲與灌量請求。
// 金流 webhook 與排程端點有各自的簽章／密鑰驗證，不在此限流（避免擋到金流商的重送）。
import { NextResponse, type NextRequest } from "next/server";
import { hit, ipFrom } from "@/lib/ratelimit";

const PER_MINUTE = Number(process.env.API_RATE_PER_MINUTE) || 120;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/stripe/") || pathname.startsWith("/api/ecpay/") || pathname.startsWith("/api/cron/") || pathname === "/api/health") {
    return NextResponse.next();
  }
  const ip = ipFrom(req.headers);
  // 無法辨識 IP（未經代理）時用共用額度，放寬 20 倍避免互相影響
  const ok = ip ? hit(`api:${ip}`, PER_MINUTE, 60_000) : hit("api:unknown", PER_MINUTE * 20, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
