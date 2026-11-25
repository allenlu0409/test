"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/admin";
import { activatePlan, downgradeToFree } from "@/lib/billing";
import { get, run, type Business, type Plan } from "@/lib/db";
import { int, str } from "@/lib/formdata";
import { backupDatabase } from "@/lib/maintenance";
import { PLANS } from "@/lib/plans";
import { nowInTz } from "@/lib/time";
import type { FormState } from "@/components/form";

export async function setSuspended(_: FormState, data: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", int(data, "id"));
  if (!biz) return { error: "找不到店家" };
  const next = biz.suspended ? 0 : 1;
  run("UPDATE businesses SET suspended = ? WHERE id = ?", next, biz.id);
  audit(admin.email, next ? "suspend" : "unsuspend", biz.slug);
  revalidatePath("/admin");
  return { ok: "" };
}

/** 手動調整方案（客服補償、銀行轉帳客戶、合作夥伴）。不經金流，需填原因留存稽核 */
export async function setPlanManually(_: FormState, data: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const plan = str(data, "plan") as Plan;
  const reason = str(data, "reason", 200);
  if (!(plan in PLANS)) return { error: "方案不正確" };
  if (!reason) return { error: "請填寫原因" };
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", int(data, "id"));
  if (!biz) return { error: "找不到店家" };
  if (biz.billing_provider) return { error: "這間店有進行中的線上訂閱，請先請店家取消訂閱再手動調整" };
  if (plan === "free") downgradeToFree(biz.id);
  else activatePlan(biz.id, plan, null, null);
  audit(admin.email, "set-plan", `${biz.slug} ${biz.plan}→${plan}：${reason}`);
  revalidatePath("/admin");
  return { ok: "已調整" };
}

export async function backupNow(): Promise<FormState> {
  const admin = await requireAdmin();
  const file = backupDatabase(nowInTz("Asia/Taipei").date);
  audit(admin.email, "backup", file ? "已建立今天的備份" : "今天已經備份過");
  revalidatePath("/admin");
  return { ok: file ? "已建立今天的備份" : "今天已經備份過了" };
}
