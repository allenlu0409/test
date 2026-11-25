import QRCode from "qrcode";
import { baseUrl, requireBusiness } from "@/lib/auth";

/** 預約頁的 QR Code（SVG，可直接印成櫃檯立牌或貼在名片上） */
export async function GET(req: Request) {
  const { biz } = await requireBusiness();
  const svg = await QRCode.toString(`${await baseUrl()}/b/${biz.slug}`, { type: "svg", margin: 2, width: 512, errorCorrectionLevel: "M" });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=300",
      ...(download ? { "Content-Disposition": `attachment; filename="qr-${biz.slug}.svg"` } : {}),
    },
  });
}
