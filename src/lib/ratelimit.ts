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
 * 取得用戶端 IP。只有在明確設定時才相信代理標頭，否則直接對外的伺服器會被偽造的標頭騙過：
 * - CLIENT_IP_HEADER：平台放真實 IP 的標頭（Fly: fly-client-ip、Cloudflare: cf-connecting-ip）
 * - TRUST_PROXY=1：前面有自己的反向代理（Caddy、nginx），取 X-Forwarded-For 最右邊那一段（代理填的，左邊的可由用戶端偽造）
 * 都沒設定時回傳 null，呼叫端改用較寬鬆的共用限額。
 */
export function ipFrom(h: Headers): string | null {
  const custom = process.env.CLIENT_IP_HEADER && h.get(process.env.CLIENT_IP_HEADER);
  if (custom) return custom.trim();
  if (process.env.TRUST_PROXY !== "1") return null;
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.length ? xff[xff.length - 1] : h.get("x-real-ip");
}
