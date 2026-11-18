"use server";

import { redirect } from "next/navigation";
import { get, run, tx, type User } from "@/lib/db";
import { businessOf, createSession, currentUser, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { clientIp, hit } from "@/lib/ratelimit";
import { CATEGORIES, CATEGORY_TEMPLATES } from "@/lib/plans";
import { seedDefaultHours } from "@/lib/booking";
import { ensureDemo } from "@/lib/seed";
import type { FormState } from "@/components/form";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const RESERVED = new Set(["demo", "admin", "api", "app", "www", "dashboard", "login", "signup", "booking", "yuehao", "support", "help"]);

function str(data: FormData, key: string, max = 200): string {
  return String(data.get(key) ?? "").trim().slice(0, max);
}

export async function signup(_: FormState, data: FormData): Promise<FormState> {
  if (!hit(`signup:${await clientIp()}`, 8, 3600_000)) return { error: "嘗試次數過多，請稍後再試" };
  const name = str(data, "name", 40);
  const email = str(data, "email", 120).toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!name) return { error: "請填寫你的稱呼" };
  if (!EMAIL_RE.test(email)) return { error: "Email 格式不正確" };
  if (password.length < 8) return { error: "密碼至少需要 8 個字元" };
  if (get("SELECT 1 AS x FROM users WHERE email = ?", email)) return { error: "這個 Email 已經註冊過，請直接登入" };

  const { id } = run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", email, hashPassword(password), name);
  await createSession(id);
  redirect("/onboarding");
}

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const email = str(data, "email", 120).toLowerCase();
  const password = String(data.get("password") ?? "");
  const ip = await clientIp();
  if (!hit(`login:${ip}`, 20, 600_000) || !hit(`login:${email}`, 8, 600_000)) return { error: "嘗試次數過多，請 10 分鐘後再試" };

  const user = get<User>("SELECT * FROM users WHERE email = ?", email);
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "Email 或密碼不正確" };
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

  tx(() => {
    const bizId = run("INSERT INTO businesses (owner_id, name, slug, category) VALUES (?, ?, ?, ?)", user.id, name, slug, category).id;
    seedDefaultHours(bizId);
    for (const s of CATEGORY_TEMPLATES[category] ?? CATEGORY_TEMPLATES.other) {
      run("INSERT INTO services (business_id, name, duration_min, price, description) VALUES (?, ?, ?, ?, ?)", bizId, s.name, s.duration, s.price, s.description);
    }
    run("INSERT INTO staff (business_id, name, title) VALUES (?, ?, ?)", bizId, user.name, "");
  });
  redirect("/dashboard?welcome=1");
}
