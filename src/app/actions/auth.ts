"use server";

import { redirect } from "next/navigation";
import { get, run, tx, type User } from "@/lib/db";
import { businessOf, createSession, currentUser, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { hit } from "@/lib/ratelimit";
import { clientIp, hitByIp } from "@/lib/client-ip";
import { CATEGORIES, CATEGORY_TEMPLATES } from "@/lib/plans";
import { seedDefaultHours } from "@/lib/booking";
import { ensureDemo } from "@/lib/seed";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mail";
import { baseUrl, destroyOtherSessions, requireBusiness } from "@/lib/auth";
import { str } from "@/lib/formdata";
import { matchTotp, newBackupCodes, newSecret, useBackupCode } from "@/lib/totp";
import { DEMO_EMAIL } from "@/lib/seed";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sendVerification } from "@/lib/verification";
import type { FormState } from "@/components/form";

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const DUMMY_HASH = hashPassword("not-a-real-password");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const RESERVED = new Set(["demo", "admin", "api", "app", "www", "dashboard", "login", "signup", "booking", "yuehao", "support", "help"]);


export async function signup(_: FormState, data: FormData): Promise<FormState> {
  if (!(await hitByIp("signup", 8, 3600_000))) return { error: "嘗試次數過多，請稍後再試" };
  const name = str(data, "name", 40);
  const email = str(data, "email", 120).toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!name) return { error: "請填寫你的稱呼" };
  if (!EMAIL_RE.test(email)) return { error: "Email 格式不正確" };
  if (password.length < 8) return { error: "密碼至少需要 8 個字元" };
  if (get("SELECT 1 AS x FROM users WHERE email = ?", email)) return { error: "這個 Email 已經註冊過，請直接登入" };

  let id: number;
  try {
    id = run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", email, hashPassword(password), name).id;
  } catch {
    return { error: "這個 Email 已經註冊過，請直接登入" }; // 重複送出時撞到 UNIQUE
  }
  await sendVerification({ id, email, name }, await baseUrl());
  // 從哪間店的預約頁看到我們的：開店時記到店家資料上
  const ref = str(data, "ref", 30).toLowerCase();
  if (/^[a-z0-9-]{3,30}$/.test(ref)) (await cookies()).set("yh_ref", ref, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 86400 });
  await createSession(id);
  redirect("/onboarding");
}

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const email = str(data, "email", 120).toLowerCase();
  const password = String(data.get("password") ?? "");
  // 以「IP＋帳號」計次：擋暴力猜密碼，但不讓外人用錯誤嘗試把別人的帳號鎖住
  const ip = (await clientIp()) ?? "unknown";
  if (!(await hitByIp("login", 30, 600_000)) || !hit(`login:${ip}:${email}`, 8, 600_000)) return { error: "嘗試次數過多，請 10 分鐘後再試" };

  const user = get<User>("SELECT * FROM users WHERE email = ?", email);
  // 帳號不存在時也做一次雜湊比對，避免從回應時間猜出哪些 Email 有註冊
  const valid = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "Email 或密碼不正確" };
  if (user.totp_enabled && user.totp_secret) {
    const code = str(data, "code", 20);
    if (!code) return { error: "這個帳號開啟了兩步驟驗證，請在下方輸入驗證器上的 6 位數驗證碼" };
    // 密碼已經對了，剩下 6 位數：以帳號計次（不分 IP），換 IP 也猜不完
    if (!hit(`totp-fail:${user.id}`, 10, 3600_000)) return { error: "驗證碼嘗試次數過多，請一小時後再試" };
    const step = matchTotp(user.totp_secret, code, Date.now(), user.totp_last_step);
    const left = step ? null : useBackupCode(JSON.parse(user.totp_backup) as string[], code);
    if (!step && !left) return { error: "驗證碼不正確。請等驗證器換下一組再試，或改用備用碼" };
    if (step) run("UPDATE users SET totp_last_step = ? WHERE id = ?", step, user.id); // 同一組碼不能用第二次
    if (left) run("UPDATE users SET totp_backup = ? WHERE id = ?", JSON.stringify(left), user.id);
  }
  await createSession(user.id);
  redirect(businessOf(user.id) ? "/dashboard" : "/onboarding");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function demoLogin(): Promise<void> {
  if (process.env.DEMO_ENABLED === "off") redirect("/signup");
  const userId = ensureDemo();
  await createSession(userId);
  redirect("/dashboard");
}

export async function createBusiness(_: FormState, data: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (businessOf(user.id)) redirect("/dashboard");

  const name = str(data, "name", 40);
  const slug = str(data, "slug", 30).toLowerCase();
  const category = str(data, "category", 20);
  if (!name) return { error: "請填寫店名" };
  if (!SLUG_RE.test(slug)) return { error: "網址代稱需為 3–30 個小寫英數字或連字號，且不能以連字號開頭或結尾" };
  if (RESERVED.has(slug)) return { error: "這個網址代稱是保留字，請換一個" };
  if (!(category in CATEGORIES)) return { error: "請選擇產業類別" };
  if (get("SELECT 1 AS x FROM businesses WHERE slug = ?", slug)) return { error: "這個網址代稱已被使用，請換一個" };

  const ref = (await cookies()).get("yh_ref")?.value ?? "";
  const referredBy = ref && get("SELECT 1 AS x FROM businesses WHERE slug = ?", ref) ? ref : "";
  try {
    tx(() => {
    const bizId = run("INSERT INTO businesses (owner_id, name, slug, category, referred_by) VALUES (?, ?, ?, ?, ?)", user.id, name, slug, category, referredBy).id;
    seedDefaultHours(bizId);
    for (const s of CATEGORY_TEMPLATES[category] ?? CATEGORY_TEMPLATES.other) {
      run("INSERT INTO services (business_id, name, duration_min, price, description) VALUES (?, ?, ?, ?, ?)", bizId, s.name, s.duration, s.price, s.description);
    }
    run("INSERT INTO staff (business_id, name, title) VALUES (?, ?, ?)", bizId, user.name, "");
    });
  } catch {
    if (businessOf(user.id)) redirect("/dashboard");
    return { error: "這個網址代稱剛剛被使用了，請換一個" };
  }
  redirect("/dashboard?welcome=1");
}

export async function resendVerification(): Promise<FormState> {
  const { user } = await requireBusiness();
  if (user.email_verified) return { ok: "信箱已經驗證過了" };
  if (!hit(`verify:${user.id}`, 3, 3600_000)) return { error: "寄送太頻繁，請一小時後再試，並檢查垃圾信匣" };
  await sendVerification(user, await baseUrl());
  return { ok: `已重新寄到 ${user.email}` };
}


export async function requestPasswordReset(_: FormState, data: FormData): Promise<FormState> {
  const email = str(data, "email", 120).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email 格式不正確" };
  if (!(await hitByIp("reset", 5, 3600_000)) || !hit(`reset:${email}`, 3, 3600_000)) return { error: "嘗試次數過多，請稍後再試" };

  const user = get<User>("SELECT * FROM users WHERE email = ?", email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    run("DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?", user.id, Date.now());
    run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha(token), user.id, Date.now() + 3600_000);
    await sendMail({
      to: user.email,
      subject: "重設你的約好密碼",
      text: `${user.name} 你好，\n\n請在 1 小時內點擊下方連結設定新密碼：\n${await baseUrl()}/reset/${token}\n\n如果不是你本人申請，請忽略這封信，密碼不會變更。`,
    });
  }
  // 不論帳號是否存在都回同樣訊息
  return { ok: "如果這個 Email 有註冊，重設密碼的連結已經寄出，請在 1 小時內使用。" };
}

export async function resetPassword(_: FormState, data: FormData): Promise<FormState> {
  const token = str(data, "token", 100);
  const password = String(data.get("password") ?? "");
  if (password.length < 8) return { error: "密碼至少需要 8 個字元" };
  const row = get<{ user_id: number }>("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?", sha(token), Date.now());
  if (!row) return { error: "連結已失效或已使用過，請重新申請" };

  tx(() => {
    // 能收到重設信就證明信箱是本人的
    run("UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?", hashPassword(password), row.user_id);
    run("DELETE FROM password_resets WHERE user_id = ?", row.user_id);
    run("DELETE FROM sessions WHERE user_id = ?", row.user_id); // 登出所有裝置
  });
  // 開了兩步驟驗證的帳號，重設密碼後仍要用驗證碼登入；否則拿到信箱就等於繞過第二道驗證
  if (get<{ totp_enabled: number }>("SELECT totp_enabled FROM users WHERE id = ?", row.user_id)?.totp_enabled) redirect("/login?reset=1");
  await createSession(row.user_id);
  redirect(businessOf(row.user_id) ? "/dashboard" : "/onboarding");
}

export async function changePassword(_: FormState, data: FormData): Promise<FormState> {
  const { user } = await requireBusiness();
  const current = String(data.get("current") ?? "");
  const next = String(data.get("password") ?? "");
  const bad = recheckPassword(user, current);
  if (bad) return { error: bad === "密碼不正確" ? "目前的密碼不正確" : bad };
  if (next.length < 8) return { error: "新密碼至少需要 8 個字元" };
  tx(() => {
    run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), user.id);
    run("DELETE FROM sessions WHERE user_id = ?", user.id);
  });
  await createSession(user.id);
  return { ok: "密碼已更新，其他裝置已登出" };
}

/** 敏感操作前重新確認密碼；以帳號計次，登入中的工作階段被盜用時也猜不完 */
function recheckPassword(user: User, password: string): string | null {
  if (!hit(`pw:${user.id}`, 10, 600_000)) return "嘗試次數過多，請 10 分鐘後再試";
  return verifyPassword(password, user.password_hash) ? null : "密碼不正確";
}

// ── 兩步驟驗證 ────────────────────────────────────────
/** 產生密鑰（尚未生效），設定頁會顯示 QR Code 讓使用者掃描 */
export async function startTotp(_: FormState, data: FormData): Promise<FormState> {
  const { user } = await requireBusiness();
  if (user.email === DEMO_EMAIL) return { error: "示範帳號無法設定" };
  if (user.totp_enabled) return { error: "已經啟用了" };
  // 要密碼：否則登入狀態被盜用的人可以替你開啟，再把你本人踢出去
  const bad = recheckPassword(user, String(data.get("password") ?? ""));
  if (bad) return { error: bad };
  run("UPDATE users SET totp_secret = ? WHERE id = ?", newSecret(), user.id);
  revalidatePath("/dashboard/settings");
  return { ok: "" };
}

/** 輸入驗證器上的驗證碼，確認掃描成功後才正式啟用 */
export async function enableTotp(_: FormState, data: FormData): Promise<FormState> {
  const { user } = await requireBusiness();
  if (!user.totp_secret || user.totp_enabled) return { error: "請重新開始設定" };
  if (!hit(`totp:${user.id}`, 10, 600_000)) return { error: "嘗試次數過多，請 10 分鐘後再試" };
  const step = matchTotp(user.totp_secret, str(data, "code", 20));
  if (!step) return { error: "驗證碼不正確，請輸入驗證器上目前顯示的 6 位數" };
  const { codes, hashes } = newBackupCodes();
  run("UPDATE users SET totp_enabled = 1, totp_backup = ?, totp_last_step = ? WHERE id = ?", JSON.stringify(hashes), step, user.id);
  await destroyOtherSessions(user.id); // 其他裝置要用驗證碼重新登入
  // 不重新整理頁面，讓備用碼留在畫面上（只顯示這一次）
  return { ok: `兩步驟驗證已啟用。請把這 8 組備用碼抄下來，手機不在身邊時可以用，每組只能用一次：\n${codes.join("　")}` };
}

export async function disableTotp(_: FormState, data: FormData): Promise<FormState> {
  const { user } = await requireBusiness();
  if (!user.totp_enabled) return { error: "尚未啟用" };
  const bad = recheckPassword(user, String(data.get("password") ?? ""));
  if (bad) return { error: bad };
  run("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup = '[]' WHERE id = ?", user.id);
  revalidatePath("/dashboard/settings");
  return { ok: "已關閉兩步驟驗證" };
}
