// 示範店家資料：讓訪客免註冊就能看到「有生意」的後台長什麼樣子。
import crypto from "node:crypto";
import { get, run, tx } from "./db.ts";
import { hashPassword } from "./password.ts";
import { seedDefaultHours } from "./booking.ts";
import { addDays, nowInTz, weekdayOf } from "./time.ts";

export const DEMO_EMAIL = "demo@yuehao.app";
export const DEMO_SLUG = "demo";

const SERVICES = [
  ["質感洗剪", 60, 900, "含頭皮按摩洗髮、剪髮與造型吹整"],
  ["設計染髮", 150, 2800, "單色染，含結構式護髮；特殊色需先漂髮"],
  ["溫塑燙", 180, 3600, "適合中長髮，含前後護髮與居家整理教學"],
  ["深層頭皮養護", 45, 1200, "頭皮檢測、去角質與精華導入"],
  ["男士剪髮", 40, 600, "含洗髮與造型"],
] as const;

const STAFF = [
  ["Mia", "店長・資深設計師"],
  ["阿哲", "設計師"],
  ["小安", "設計師"],
] as const;

const SURNAMES = "陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周";
const GIVEN = ["怡君", "雅婷", "家豪", "冠宇", "欣怡", "承恩", "宜蓁", "柏翰", "詩涵", "子晴", "志明", "佩珊", "宥廷", "品妤", "建宏", "思妤"];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 建立（或取得）示範帳號，回傳 user id */
export function ensureDemo(): number {
  const existing = get<{ id: number }>("SELECT id FROM users WHERE email = ?", DEMO_EMAIL);
  if (existing) return existing.id;

  return tx(() => {
    const rand = rng(20261118);
    // 隨機密碼：示範帳號只能透過「體驗 Demo」按鈕進入
    const userId = run(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      DEMO_EMAIL,
      hashPassword(crypto.randomBytes(24).toString("hex")),
      "示範店長",
    ).id;
    const bizId = run(
      `INSERT INTO businesses (owner_id, name, slug, category, description, phone, address, notice, plan, min_lead_minutes)
       VALUES (?, ?, ?, 'hair', ?, ?, ?, ?, 'pro', 60)`,
      userId,
      "木木髮藝 Mumu Hair",
      DEMO_SLUG,
      "巷弄裡的三張椅子。擅長好整理的日系剪裁與低傷害染燙，全預約制，讓每位客人都有完整的時間。",
      "02-2700-1234",
      "台北市大安區安和路一段 27 巷 8 號 1 樓",
      "遲到超過 15 分鐘可能需要調整服務內容；如需取消請於前一天告知，謝謝體諒。",
    ).id;
    seedDefaultHours(bizId);

    const serviceIds = SERVICES.map(([name, dur, price, desc]) =>
      run("INSERT INTO services (business_id, name, duration_min, price, description) VALUES (?, ?, ?, ?, ?)", bizId, name, dur, price, desc).id,
    );
    const staffIds = STAFF.map(([name, title]) => run("INSERT INTO staff (business_id, name, title) VALUES (?, ?, ?)", bizId, name, title).id);

    const today = nowInTz("Asia/Taipei").date;
    const customerIds: number[] = [];
    for (let i = 0; i < 36; i++) {
      const name = SURNAMES[Math.floor(rand() * SURNAMES.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
      const phone = `09${String(10000000 + Math.floor(rand() * 89999999))}`;
      const created = addDays(today, -Math.floor(rand() * 75));
      const r = run(
        "INSERT OR IGNORE INTO customers (business_id, name, phone, created_at) VALUES (?, ?, ?, ?)",
        bizId,
        name,
        phone,
        `${created} 04:00:00`,
      );
      if (r.changes) customerIds.push(r.id);
    }

    for (let offset = -45; offset <= 10; offset++) {
      const date = addDays(today, offset);
      const wd = weekdayOf(date);
      if (wd === 1) continue;
      const close = wd === 0 ? 1080 : 1200;
      const weekend = wd === 0 || wd === 6;
      for (const staffId of staffIds) {
        let t = 600 + Math.floor(rand() * 3) * 30;
        while (true) {
          // 平日較空、週末較滿；未來的日子預約還沒滿
          const skip = offset > 0 ? 0.45 + offset * 0.04 : weekend ? 0.2 : 0.42;
          const si = Math.floor(rand() * SERVICES.length);
          const [, dur, price] = SERVICES[si];
          if (t + dur > close) break;
          if (rand() > skip) {
            const roll = rand();
            const status = offset >= 0 ? "confirmed" : roll < 0.86 ? "completed" : roll < 0.94 ? "cancelled" : "no_show";
            run(
              `INSERT INTO bookings (business_id, service_id, staff_id, customer_id, date, start_min, end_min, price, status, token, source, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              bizId,
              serviceIds[si],
              staffId,
              customerIds[Math.floor(rand() * customerIds.length)],
              date,
              t,
              t + dur,
              price,
              status,
              crypto.randomBytes(18).toString("base64url"),
              rand() < 0.8 ? "online" : "manual",
              `${addDays(date, -1 - Math.floor(rand() * 6))} 03:00:00`,
            );
            t += dur;
          }
          t += Math.floor(rand() * 3) * 30 + (rand() > skip ? 0 : 30);
        }
      }
    }
    return userId;
  });
}
