// 單機記憶體限流（純函式，proxy 與 server action 共用）。多機部署時請換成 Redis。

const buckets = new Map<string, { count: number; reset: number }>();

export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/**
 * 取得用戶端 IP。X-Forwarded-For 最左邊的值可由用戶端偽造，所以取最右邊（最靠近我們的代理填入的）。
 * 平台有專用標頭時（Fly: fly-client-ip、Cloudflare: cf-connecting-ip）請設 CLIENT_IP_HEADER。
 * 沒有任何代理標頭時回傳 null，呼叫端應改用較寬鬆的共用限額。
 */
export function ipFrom(h: Headers): string | null {
  const custom = process.env.CLIENT_IP_HEADER && h.get(process.env.CLIENT_IP_HEADER);
  if (custom) return custom.trim();
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.length ? xff[xff.length - 1] : h.get("x-real-ip");
}
