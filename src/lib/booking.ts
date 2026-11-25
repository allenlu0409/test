// 預約的資料存取與商業規則：可預約時段、額度、建立預約（含防重複預約）。
import crypto from "node:crypto";
import { all, get, run, tx, type Booking, type Business, type Service, type Staff } from "./db.ts";
import { computeSlots, overlaps, type Interval, type Slot } from "./slots.ts";
import { isDateStr, localMidnightUtc, nowInTz, weekdayOf } from "./time.ts";
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

/** 各人員「不提供」的服務。預設每個人都做全部服務，所以只記例外 */
export function serviceExclusions(bizId: number): Map<number, Set<number>> {
  const rows = all<{ staff_id: number; service_id: number }>(
    "SELECT x.staff_id, x.service_id FROM staff_service_exclusions x JOIN staff s ON s.id = x.staff_id WHERE s.business_id = ?",
    bizId,
  );
  const map = new Map<number, Set<number>>();
  for (const r of rows) map.set(r.staff_id, (map.get(r.staff_id) ?? new Set()).add(r.service_id));
  return map;
}

export function offWeekdays(staff: Pick<Staff, "off_weekdays">): number[] {
  return staff.off_weekdays ? staff.off_weekdays.split(",").map(Number) : [];
}

/** 可以做這項服務的在職人員；傳入 date 時再排除當天固定休假的人 */
export function eligibleStaff(bizId: number, serviceId: number, date?: string): Staff[] {
  const excluded = serviceExclusions(bizId);
  const wd = date ? weekdayOf(date) : -1;
  return activeStaff(bizId).filter((s) => !excluded.get(s.id)?.has(serviceId) && !offWeekdays(s).includes(wd));
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
  const staff = eligibleStaff(biz.id, service.id, date).map((s) => s.id);
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

/** 本月（商家時區）收到的線上預約數，用於免費版額度。已取消的不計，避免被「約了又取消」耗盡額度 */
export function monthlyOnlineCount(biz: Pick<Business, "id" | "timezone">): number {
  const monthStart = `${nowInTz(biz.timezone).date.slice(0, 7)}-01`;
  const r = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM bookings WHERE business_id = ? AND source = 'online' AND status != 'cancelled' AND created_at >= ?",
    biz.id,
    localMidnightUtc(monthStart, biz.timezone),
  );
  return r?.n ?? 0;
}

export function quotaReached(biz: Business): boolean {
  const limit = planOf(biz.plan).monthlyBookings;
  return Number.isFinite(limit) && monthlyOnlineCount(biz) >= limit;
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
  if (input.start + service.duration_min > 1440) return { ok: false, error: "預約不能跨過午夜，請改約較早的時間" };

  try {
    return tx<CreateBookingResult>(() => {
      let staffId: number | undefined;

      if (source === "online") {
        if (biz.suspended) return { ok: false, error: "這間店目前暫停線上預約" };
        if (quotaReached(biz)) return { ok: false, error: "本月線上預約已額滿，請直接與店家聯繫" };
        const slot = availableSlots(biz, service, input.date, input.staffId).find((s) => s.start === input.start);
        if (!slot) return { ok: false, error: "這個時段剛剛被訂走了，請改選其他時段" };
        staffId = slot.staffIds[0];
      } else {
        // 店家手動建立：不受營業時間與提前時間限制，只擋同一人員撞期
        // 店家可以把預約排在人員的固定休假日（加班），但不會排給不做這項服務的人
        const staff = eligibleStaff(biz.id, service.id);
        const want: Interval = [input.start, input.start + service.duration_min];
        const busy = busyMap(biz.id, input.date);
        const candidates = input.staffId ? staff.filter((s) => s.id === input.staffId) : staff;
        staffId = candidates.find((s) => !(busy.get(s.id) ?? []).some((b) => overlaps(want, b)))?.id;
        if (!staffId) return { ok: false, error: staff.length ? "該時段服務人員已有其他預約" : "沒有可以做這項服務的人員" };
      }

      const existing = get<{ id: number }>("SELECT id FROM customers WHERE business_id = ? AND phone = ?", biz.id, phone);
      let customerId: number;
      if (existing) {
        customerId = existing.id;
        if (source === "manual") {
          run("UPDATE customers SET name = ? WHERE id = ?", name, customerId);
        } else if (email) {
          // 線上預約是匿名的：不覆寫既有顧客的姓名，Email 只在原本沒有時補上
          run("UPDATE customers SET email = ? WHERE id = ? AND email = ''", email, customerId);
        }
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

/** 把預約改回「已確認」前檢查：同一人員同一天是否已有其他有效預約重疊 */
export function conflictsWithOthers(b: Pick<Booking, "id" | "business_id" | "staff_id" | "date" | "start_min" | "end_min">): boolean {
  return !!get(
    `SELECT 1 AS x FROM bookings WHERE business_id = ? AND staff_id = ? AND date = ? AND id != ?
     AND status IN ('confirmed','completed') AND start_min < ? AND end_min > ?`,
    b.business_id,
    b.staff_id,
    b.date,
    b.id,
    b.end_min,
    b.start_min,
  );
}
