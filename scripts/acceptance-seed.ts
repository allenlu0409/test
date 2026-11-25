// 驗收與預覽用的資料：示範店家、一個可以進營運後台的管理者、一間付費店、一間額度快滿的免費店。
// 可重複執行。用法見 scripts/preview.sh。
import crypto from "node:crypto";
import { get, run, tx, type Business } from "../src/lib/db.ts";
import { hashPassword } from "../src/lib/password.ts";
import { activatePlan, nextRenewal, recordPayment } from "../src/lib/billing.ts";
import { createBooking, seedDefaultHours } from "../src/lib/booking.ts";
import { CATEGORY_TEMPLATES } from "../src/lib/plans.ts";
import { ensureDemo } from "../src/lib/seed.ts";
import { addDays, nowInTz, weekdayOf } from "../src/lib/time.ts";

export const PASSWORD = "yuehao-2026";
export const ADMIN = "admin@yuehao.test";

function shop(email: string, owner: string, name: string, slug: string, category: string): Business | null {
  if (get("SELECT 1 AS x FROM users WHERE email = ?", email)) return null;
  return tx(() => {
    const uid = run("INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, ?, ?, 1)", email, hashPassword(PASSWORD), owner).id;
    const id = run("INSERT INTO businesses (owner_id, name, slug, category, min_lead_minutes, phone, address) VALUES (?, ?, ?, ?, 60, '02-2345-6789', '台北市信義區示範路 1 號')", uid, name, slug, category).id;
    seedDefaultHours(id);
    for (const s of CATEGORY_TEMPLATES[category]) run("INSERT INTO services (business_id, name, duration_min, price, description) VALUES (?, ?, ?, ?, ?)", id, s.name, s.duration, s.price, s.description);
    run("INSERT INTO staff (business_id, name) VALUES (?, ?)", id, owner);
    return get<Business>("SELECT * FROM businesses WHERE id = ?", id)!;
  });
}

/** 在接下來幾個營業日排進幾筆線上預約 */
function fill(biz: Business, count: number) {
  const service = get<{ id: number }>("SELECT id FROM services WHERE business_id = ? ORDER BY id", biz.id)!.id;
  const today = nowInTz(biz.timezone).date;
  let made = 0;
  for (let d = 1; d <= 25 && made < count; d++) {
    const date = addDays(today, d);
    if (weekdayOf(date) === 1) continue;
    for (const start of [600, 690, 780, 870, 960, 1050]) {
      if (made >= count) break;
      const r = createBooking({ biz, serviceId: service, staffId: null, date, start, source: "online", name: `顧客${made + 1}`, phone: `09${String(10000000 + biz.id * 1000 + made)}` });
      if (r.ok) made++;
    }
  }
}

ensureDemo();
shop(ADMIN, "營運者", "驗收測試店", "accept-shop", "hair");

const paid = shop("lin@yuehao.test", "小林", "小林美甲", "lin-nail", "nail");
if (paid) {
  const now = Math.floor(Date.now() / 1000);
  activatePlan(paid.id, "pro", nextRenewal(now, "month"), null);
  recordPayment({ businessId: paid.id, provider: "ecpay", plan: "pro", amount: 499, reference: `SEED${crypto.randomBytes(4).toString("hex")}`, status: "paid" });
  fill(paid, 8);
}

const free = shop("cheng@yuehao.test", "阿成", "阿成理髮", "cheng-barber", "hair");
if (free) fill(free, 26); // 免費版每月 30 筆，已用 26 筆：後台會出現額度提醒

console.log(`驗收資料已就緒。帳號密碼都是 ${PASSWORD}：${ADMIN}（營運後台）、lin@yuehao.test（付費店）、cheng@yuehao.test（額度快滿的免費店）`);
