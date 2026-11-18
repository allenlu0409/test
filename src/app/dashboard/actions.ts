"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, run, tx, type Plan } from "@/lib/db";
import { requireBusiness } from "@/lib/auth";
import { createBooking } from "@/lib/booking";
import { planOf, PLANS } from "@/lib/plans";
import { isDateStr, parseTime } from "@/lib/time";
import { createCheckout, createPortal, demoBillingEnabled, stripeEnabled } from "@/lib/stripe";
import { DEMO_EMAIL } from "@/lib/seed";
import type { FormState } from "@/components/form";

function str(data: FormData, key: string, max = 200): string {
  return String(data.get(key) ?? "").trim().slice(0, max);
}
function int(data: FormData, key: string): number {
  const n = Number(data.get(key));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
function done(msg = "已儲存"): FormState {
  revalidatePath("/dashboard", "layout");
  return { ok: msg };
}

// ── 服務項目 ──────────────────────────────────────────
export async function saveService(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const id = int(data, "id");
  const name = str(data, "name", 40);
  const description = str(data, "description", 200);
  const duration = int(data, "duration");
  const price = int(data, "price");
  if (!name) return { error: "請填寫服務名稱" };
  if (!(duration >= 5 && duration <= 600)) return { error: "時長需介於 5–600 分鐘" };
  if (!(price >= 0 && price <= 1_000_000)) return { error: "價格不正確" };

  if (id) {
    run("UPDATE services SET name = ?, description = ?, duration_min = ?, price = ? WHERE id = ? AND business_id = ?", name, description, duration, price, id, biz.id);
    return done();
  }
  run("INSERT INTO services (business_id, name, description, duration_min, price) VALUES (?, ?, ?, ?, ?)", biz.id, name, description, duration, price);
  return done("已新增服務");
}

export async function toggleService(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  run("UPDATE services SET active = 1 - active WHERE id = ? AND business_id = ?", int(data, "id"), biz.id);
  return done("");
}

export async function archiveService(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  run("UPDATE services SET archived = 1, active = 0 WHERE id = ? AND business_id = ?", int(data, "id"), biz.id);
  return done("");
}

// ── 服務人員 ──────────────────────────────────────────
export async function saveStaff(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const id = int(data, "id");
  const name = str(data, "name", 30);
  const title = str(data, "title", 40);
  if (!name) return { error: "請填寫名稱" };

  if (id) {
    run("UPDATE staff SET name = ?, title = ? WHERE id = ? AND business_id = ?", name, title, id, biz.id);
    return done();
  }
  const plan = planOf(biz.plan);
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE business_id = ? AND archived = 0", biz.id)!.n;
  if (count >= plan.maxStaff) {
    return { error: `${plan.name}最多 ${plan.maxStaff} 位服務人員，升級方案即可新增更多` };
  }
  run("INSERT INTO staff (business_id, name, title) VALUES (?, ?, ?)", biz.id, name, title);
  return done("已新增人員");
}

export async function toggleStaff(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  run("UPDATE staff SET active = 1 - active WHERE id = ? AND business_id = ?", int(data, "id"), biz.id);
  return done("");
}

export async function archiveStaff(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const id = int(data, "id");
  const upcoming = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM bookings WHERE staff_id = ? AND business_id = ? AND status = 'confirmed' AND date >= date('now')",
    id,
    biz.id,
  )!.n;
  if (upcoming) return { error: `還有 ${upcoming} 筆未完成的預約，請先處理` };
  run("UPDATE staff SET archived = 1, active = 0 WHERE id = ? AND business_id = ?", id, biz.id);
  return done("");
}

// ── 營業時間與預約規則 ────────────────────────────────
export async function saveHours(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const rows: [number, number, number, number][] = [];
  for (let wd = 0; wd < 7; wd++) {
    const closed = data.get(`closed_${wd}`) === "on" ? 1 : 0;
    const open = parseTime(str(data, `open_${wd}`));
    const close = parseTime(str(data, `close_${wd}`));
    if (open == null || close == null) return { error: "時間格式不正確" };
    if (!closed && close <= open) return { error: "打烊時間必須晚於開始時間" };
    rows.push([wd, open, close, closed]);
  }
  const interval = int(data, "slot_interval");
  const lead = int(data, "min_lead_minutes");
  const advance = int(data, "max_advance_days");
  if (![15, 20, 30, 60].includes(interval)) return { error: "時段間隔不正確" };
  if (!(lead >= 0 && lead <= 10080)) return { error: "提前時間不正確" };
  if (!(advance >= 1 && advance <= 365)) return { error: "開放天數需介於 1–365" };

  tx(() => {
    for (const [wd, open, close, closed] of rows) {
      run(
        `INSERT INTO hours (business_id, weekday, open_min, close_min, closed) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (business_id, weekday) DO UPDATE SET open_min = excluded.open_min, close_min = excluded.close_min, closed = excluded.closed`,
        biz.id,
        wd,
        open,
        close,
        closed,
      );
    }
    run("UPDATE businesses SET slot_interval = ?, min_lead_minutes = ?, max_advance_days = ? WHERE id = ?", interval, lead, advance, biz.id);
  });
  return done();
}

export async function addClosedDate(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const date = str(data, "date");
  if (!isDateStr(date)) return { error: "請選擇日期" };
  run("INSERT OR REPLACE INTO closed_dates (business_id, date, note) VALUES (?, ?, ?)", biz.id, date, str(data, "note", 40));
  return done("已新增公休日");
}

export async function removeClosedDate(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  run("DELETE FROM closed_dates WHERE business_id = ? AND date = ?", biz.id, str(data, "date"));
  return done("");
}

// ── 預約 ──────────────────────────────────────────────
export async function setBookingStatus(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const status = str(data, "status");
  if (!["confirmed", "completed", "cancelled", "no_show"].includes(status)) return { error: "狀態不正確" };
  run("UPDATE bookings SET status = ? WHERE id = ? AND business_id = ?", status, int(data, "id"), biz.id);
  return done("");
}

export async function createManualBooking(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  const start = parseTime(str(data, "time"));
  if (start == null) return { error: "請填寫時間" };
  const result = createBooking({
    biz,
    serviceId: int(data, "service_id"),
    staffId: int(data, "staff_id") || null,
    date: str(data, "date"),
    start,
    name: str(data, "name"),
    phone: str(data, "phone"),
    note: str(data, "note", 300),
    source: "manual",
  });
  if (!result.ok) return { error: result.error };
  return done("已建立預約");
}

// ── 顧客 ──────────────────────────────────────────────
export async function saveCustomerNote(_: FormState, data: FormData): Promise<FormState> {
  const { biz } = await requireBusiness();
  run("UPDATE customers SET note = ? WHERE id = ? AND business_id = ?", str(data, "note", 500), int(data, "id"), biz.id);
  return done();
}

// ── 店家設定 ──────────────────────────────────────────
export async function saveSettings(_: FormState, data: FormData): Promise<FormState> {
  const { biz, user } = await requireBusiness();
  if (user.email === DEMO_EMAIL) return { error: "示範店家的資料是所有訪客共用的，無法修改。註冊自己的帳號就能自由設定" };
  const name = str(data, "name", 40);
  if (!name) return { error: "請填寫店名" };
  let color = str(data, "brand_color", 7).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color) || !planOf(biz.plan).removeBranding) color = biz.brand_color;
  run(
    "UPDATE businesses SET name = ?, description = ?, phone = ?, address = ?, notice = ?, brand_color = ? WHERE id = ?",
    name,
    str(data, "description", 300),
    str(data, "phone", 30),
    str(data, "address", 100),
    str(data, "notice", 300),
    color,
    biz.id,
  );
  return done();
}

// ── 方案與帳單 ────────────────────────────────────────
export async function changePlan(_: FormState, data: FormData): Promise<FormState> {
  const { biz, user } = await requireBusiness();
  const plan = str(data, "plan") as Plan;
  if (!(plan in PLANS)) return { error: "方案不正確" };

  let url: string;
  if (stripeEnabled()) {
    try {
      // 已有訂閱者一律到 Stripe 客戶入口變更或取消，避免重複訂閱
      url =
        biz.stripe_customer_id && biz.stripe_subscription_id
          ? await createPortal(biz.stripe_customer_id)
          : plan === "free"
            ? "/dashboard/billing"
            : await createCheckout({ plan, businessId: biz.id, email: user.email, customerId: biz.stripe_customer_id });
    } catch (e) {
      console.error("stripe error", e);
      return { error: `金流暫時無法使用：${e instanceof Error ? e.message : "未知錯誤"}` };
    }
  } else if (demoBillingEnabled()) {
    run("UPDATE businesses SET plan = ? WHERE id = ?", plan, biz.id);
    revalidatePath("/dashboard", "layout");
    url = "/dashboard/billing?status=switched";
  } else {
    return { error: "尚未設定金流，請聯繫客服協助升級" };
  }
  redirect(url);
}
