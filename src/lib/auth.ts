import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "./admin";
import { get, run, type Business, type User } from "./db";

export { hashPassword, verifyPassword } from "./password";

const COOKIE = "yh_session";
const SESSION_DAYS = 30;

function sha(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 86400000;
  run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
    path: "/",
    expires: new Date(expires),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const user = get<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha(token),
    Date.now(),
  );
  return user ?? null;
}

export function businessOf(userId: number): Business | undefined {
  return get<Business>("SELECT * FROM businesses WHERE owner_id = ?", userId);
}

/** 後台頁面與 server action 的守門：未登入導向登入頁、未建立店家導向開店流程 */
export async function requireBusiness(): Promise<{ user: User; biz: Business }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const biz = businessOf(user.id);
  if (!biz) redirect("/onboarding");
  return { user, biz };
}

/** 對外網址：優先用 APP_URL，未設定時依請求的 Host 推得（反向代理後亦適用） */
export async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** 營運後台守門：非管理者一律回 404，不透露後台存在 */
export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return user;
}
