import type { MetadataRoute } from "next";

/** 讓店家可以把後台「加入主畫面」，像 App 一樣每天打開 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "約好 Yuehao",
    short_name: "約好",
    description: "美甲、美睫、美髮的線上預約本",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f1f2f4",
    theme_color: "#1d3fae",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
