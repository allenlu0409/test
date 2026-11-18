import type { MetadataRoute } from "next";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** 首頁與各店家的公開預約頁（店家頁被搜尋到，對店家和我們都是免費流量） */
export default function sitemap(): MetadataRoute.Sitemap {
  const shops = all<{ slug: string }>("SELECT slug FROM businesses ORDER BY id LIMIT 5000");
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/signup`, priority: 0.8 },
    { url: `${base}/terms`, priority: 0.2 },
    { url: `${base}/privacy`, priority: 0.2 },
    ...shops.map((s) => ({ url: `${base}/b/${s.slug}`, priority: 0.6 })),
  ];
}
