import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: { default: "約好｜美業與工作室的線上預約系統", template: "%s｜約好" },
  description: "三分鐘開好你的預約頁。客人 24 小時自己選時段，你不用再來回傳訊息喬時間。美髮、美甲美睫、教練、工作室都適用。",
  openGraph: {
    title: "約好｜美業與工作室的線上預約系統",
    description: "客人自己約，你專心服務。三分鐘開好預約頁，免費開始。",
    type: "website",
    locale: "zh_TW",
  },
};

export const viewport: Viewport = { themeColor: "#1d3fae", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
