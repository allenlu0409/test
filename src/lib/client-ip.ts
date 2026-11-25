// 依目前請求的標頭做 IP 限流（server action／route handler 用）。
import { headers } from "next/headers";
import { hit, ipFrom } from "./ratelimit";

export async function clientIp(): Promise<string | null> {
  return ipFrom(await headers());
}

/** 依 IP 限流；無法辨識 IP 時改用 scope 共用、放寬 fallbackFactor 倍的限額，避免單一用戶擋住所有人 */
export async function hitByIp(scope: string, limit: number, windowMs: number, fallbackFactor = 20): Promise<boolean> {
  const ip = await clientIp();
  return ip ? hit(`${scope}:${ip}`, limit, windowMs) : hit(`${scope}:unknown`, limit * fallbackFactor, windowMs);
}
