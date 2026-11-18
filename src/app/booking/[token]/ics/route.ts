import { get, BOOKING_JOIN, type BookingRow, type Business } from "@/lib/db";
import { pad } from "@/lib/time";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function stamp(date: string, min: number): string {
  return `${date.replaceAll("-", "")}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = get<BookingRow>(`${BOOKING_JOIN} WHERE b.token = ?`, token);
  if (!b) return new Response("Not found", { status: 404 });
  const biz = get<Business>("SELECT * FROM businesses WHERE id = ?", b.business_id)!;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yuehao//Booking//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${b.id}-${token.slice(0, 8)}@yuehao`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART;TZID=${biz.timezone}:${stamp(b.date, b.start_min)}`,
    `DTEND;TZID=${biz.timezone}:${stamp(b.date, b.end_min)}`,
    `SUMMARY:${esc(`${biz.name}｜${b.service_name}`)}`,
    biz.address ? `LOCATION:${esc(biz.address)}` : "",
    `DESCRIPTION:${esc(`服務人員：${b.staff_name}${biz.phone ? `\n店家電話：${biz.phone}` : ""}`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:預約提醒",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Response(ics.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking.ics"',
      "Cache-Control": "no-store",
    },
  });
}
