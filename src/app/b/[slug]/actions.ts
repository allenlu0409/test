"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { get, type Business } from "@/lib/db";
import { createBooking } from "@/lib/booking";
import { hitByIp } from "@/lib/client-ip";
import { notifyBookingCreated, notifyQuota } from "@/lib/notify";

export interface BookInput {
  slug: string;
  serviceId: number;
  staffId: number | null;
  date: string;
  start: number;
  name: string;
  phone: string;
  email: string;
  note: string;
  /** 蜜罐欄位：真人不會填 */
  website: string;
}

export async function book(input: BookInput): Promise<{ error: string }> {
  if (input.website) return { error: "送出失敗，請重新整理後再試" };
  if (!(await hitByIp(`book:${String(input.slug).slice(0, 40)}`, 10, 3600_000))) return { error: "預約次數過於頻繁，請稍後再試或直接聯繫店家" };

  const biz = get<Business>("SELECT * FROM businesses WHERE slug = ?", String(input.slug));
  if (!biz) return { error: "找不到這間店" };

  const result = createBooking({
    biz,
    serviceId: Number(input.serviceId),
    staffId: input.staffId ? Number(input.staffId) : null,
    date: String(input.date),
    start: Number(input.start),
    name: String(input.name ?? ""),
    phone: String(input.phone ?? ""),
    email: String(input.email ?? ""),
    note: String(input.note ?? ""),
    source: "online",
  });
  if (!result.ok) return { error: result.error };
  const bookingId = result.booking.id;
  after(() =>
    notifyBookingCreated(bookingId)
      .then(() => notifyQuota(biz.id))
      .catch((e) => console.error("notify failed", e)),
  );
  redirect(`/booking/${result.booking.token}?new=1`);
}
