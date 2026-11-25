import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

// 內容安全政策：只允許本站資源；表單只能送往本站與金流商的付款頁。
// Next.js 的 hydration 需要 inline script，因此 script-src 保留 'unsafe-inline'（輸出一律經 React 轉義）。
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://payment.ecpay.com.tw https://payment-stage.ecpay.com.tw https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(prod
            ? [
                { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
                { key: "Content-Security-Policy", value: csp },
              ]
            : []),
        ],
      },
    ];
  },
};

export default config;
