// 預約的資料存取與商業規則：可預約時段、額度、建立預約（含防重複預約）。
import crypto from "node:crypto";
import { all, get, run, tx, type Booking, type Business, type Service, type Staff } from "./db.ts";
import { computeSlots, overlaps, type Interval, type Slot } from "./slots.ts";
import { isDateStr, nowInTz, weekdayOf } from "./time.ts";
import { planOf } from "./plans.ts";

export interface DayHours {
  open: number;
  close: number;
  closed: boolean;
}

export function hoursOf(bizId: number): Map<number, DayHours> {
  const rows = all<{ weekday: number; open_min: number; close_min: number; closed: number }>(
    "SELECT * FROM hours WHERE business_id = ?",
    bizId,
  );
  return new Map(rows.map((r) => [r.weekday, { open: r.open_min, close: r.close_min, closed: !!r.closed }]));
}

export function activeServices(bizId: number): Service[] {
  return all<Service>("SELECT * FROM services WHERE business_id = ? AND active = 1 AND archived = 0 ORDER BY id", bizId);
}

export function activeStaff(bizId: number): Staff[] {
  return all<Staff>("SELECT * FROM staff WHERE business_id = ? AND active = 1 AND archived = 0 ORDER BY id", bizId);
}

function busyMap(bizId: number, date: string): Map<number, Interval[]> {
  const rows = all<{ staff_id: number; start_min: number; end_min: number }>(
    "SELECT staff_id, start_min, end_min FROM bookings WHERE business_id = ? AND date = ? AND status IN ('confirmed','completed')",
    bizId,
    date,
  );
  const map = new Map<number, Interval[]>();
  for (const r of rows) {
    const list = map.get(r.staff_id) ?? [];
    list.push([r.start_min, r.end_min]);
    map.set(r.staff_id, list);
  }
  return map;
}

export function isClosedDate(bizId: number, date: string): boolean {
  return !!get("SELECT 1 AS x FROM closed_dates WHERE business_id = ? AND date = ?", bizId, date);
}

export function availableSlots(biz: Business, service: Service, date: string, staffId: number | null): Slot[] {
  const staff = activeStaff(biz.id).map((s) => s.id);
  const staffIds = staffId ? staff.filter((id) => id === staffId) : staff;
  return computeSlots({
    date,
    duration: service.duration_min,
    hours: hoursOf(biz.id).get(weekdayOf(date)) ?? null,
    interval: biz.slot_interval,
    staffIds,
    busy: busyMap(biz.id, date),
    now: nowInTz(biz.timezone),
    minLeadMinutes: biz.min_lead_minutes,
    maxAdvanceDays: biz.max_advance_days,
    isClosedDate: isClosedDate(biz.id, date),
  });
}

/** 本月（UTC 月份）已收到的線上預約數，用於免費版額度 */
export function monthlyOnlineCount(bizId: number): number {
  const r = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM bookings WHERE business_id = ? AND source = 'online' AND created_at >= datetime('now','start of month')",
    bizId,
  );
  return r?.n ?? 0;
}

export function quotaReached(biz: Business): boolean {
  const limit = planOf(biz.plan).monthlyBookings;
  return Number.isFinite(limit) && monthlyOnlineCount(biz.id) >= limit;
}

export function normalizePhone(raw: string): string | null {
  const p = raw.replace(/[\s\-()]/g, "");
  return /^\+?\d{8,15}$/.test(p) ? p : null;
}

export interface CreateBookingInput {
  biz: Business;
  serviceId: number;
  staffId: number | null;
  date: string;
  start: number;
  name: string;
  phone: string;
  email?: string;
  note?: string;
  source: "online" | "manual";
}

export type CreateBookingResult = { ok: true; booking: Booking } | { ok: false; error: string };

export function createBooking(input: CreateBookingInput): CreateBookingResult {
  const { biz, source } = input;
  const name = input.name.trim().slice(0, 40);
  const phone = normalizePhone(input.phone);
  const email = (input.email ?? "").trim().slice(0, 120);
  const note = (input.note ?? "").trim().slice(0, 300);

  if (!name) return { ok: false, error: "請填寫姓名" };
  if (!phone) return { ok: false, error: "請填寫正確的手機號碼" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email 格式不正確" };
  if (!isDateStr(input.date)) return { ok: false, error: "日期不正確" };
  if (!Number.isInteger(input.start) || input.start < 0 || input.start >= 1440) return { ok: false, error: "時間不正確" };

  const service = get<Service>(
    "SELECT * FROM services WHERE id = ? AND business_id = ? AND archived = 0",
    input.serviceId,
    biz.id,
  );
  if (!service || (source === "online" && !service.active)) return { ok: false, error: "找不到這項服務" };

  try {
    return tx<CreateBookingResult>(() => {
      let staffId: number | undefined;

      if (source === "online") {
        if (quotaReached(biz)) return { ok: false, error: "本月線上預約已額滿，請直接與店家聯繫" };
        const slot = availableSlots(biz, service, input.date, input.staffId).find((s) => s.start === input.start);
        if (!slot) return { ok: false, error: "這個時段剛剛被訂走了，請改選其他時段" };
        staffId = slot.staffIds[0];
      } else {
        // 店家手動建立：不受營業時間與提前時間限制，只擋同一人員撞期
        const staff = activeStaff(biz.id);
        const want: Interval = [input.start, input.start + service.duration_min];
        const busy = busyMap(biz.id, input.date);
        const candidates = input.staffId ? staff.filter((s) => s.id === input.staffId) : staff;
        staffId = candidates.find((s) => !(busy.get(s.id) ?? []).some((b) => overlaps(want, b)))?.id;
        if (!staffId) return { ok: false, error: "該時段服務人員已有其他預約" };
      }

      const existing = get<{ id: number }>("SELECT id FROM customers WHERE business_id = ? AND phone = ?", biz.id, phone);
      let customerId: number;
      if (existing) {
        customerId = existing.id;
        run("UPDATE customers SET name = ?, email = CASE WHEN ? != '' THEN ? ELSE email END WHERE id = ?", name, email, email, customerId);
      } else {
        customerId = run("INSERT INTO customers (business_id, name, phone, email) VALUES (?, ?, ?, ?)", biz.id, name, phone, email).id;
      }

      const token = crypto.randomBytes(18).toString("base64url");
      const { id } = run(
        `INSERT INTO bookings (business_id, service_id, staff_id, customer_id, date, start_min, end_min, price, note, token, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        biz.id,
        service.id,
        staffId,
        customerId,
        input.date,
        input.start,
        input.start + service.duration_min,
        service.price,
        note,
        token,
        source,
      );
      return { ok: true, booking: get<Booking>("SELECT * FROM bookings WHERE id = ?", id)! };
    });
  } catch (e) {
    console.error("createBooking failed", e);
    return { ok: false, error: "系統忙碌中，請稍後再試" };
  }
}

/** 新店家的預設營業時間：週二至週六 10:00–20:00、週日 10:00–18:00、週一公休 */
export function seedDefaultHours(bizId: number): void {
  for (let wd = 0; wd < 7; wd++) {
    run(
      "INSERT OR IGNORE INTO hours (business_id, weekday, open_min, close_min, closed) VALUES (?, ?, ?, ?, ?)",
      bizId,
      wd,
      600,
      wd === 0 ? 1080 : 1200,
      wd === 1 ? 1 : 0,
    );
  }
}
