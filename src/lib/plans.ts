import type { Plan } from "./db.ts";

export interface PlanDef {
  id: Plan;
  name: string;
  price: number;
  tagline: string;
  maxStaff: number;
  /** 每月線上預約上限（Infinity = 不限） */
  monthlyBookings: number;
  removeBranding: boolean;
  csvExport: boolean;
  analytics: boolean;
  /** 預約前一天自動寄 Email 提醒顧客 */
  reminders: boolean;
  features: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  free: {
    id: "free",
    name: "免費版",
    price: 0,
    tagline: "一個人的工作室，先用起來",
    maxStaff: 1,
    monthlyBookings: 30,
    removeBranding: false,
    csvExport: false,
    analytics: false,
    reminders: false,
    features: ["專屬預約頁面", "1 位服務人員", "每月 30 筆線上預約", "新預約 Email 通知", "顧客名單與行事曆"],
  },
  pro: {
    id: "pro",
    name: "專業版",
    price: 499,
    tagline: "預約開始變多的店家",
    maxStaff: 5,
    monthlyBookings: Infinity,
    removeBranding: true,
    csvExport: true,
    analytics: true,
    reminders: true,
    features: ["線上預約不限筆數", "最多 5 位服務人員", "預約前一天自動提醒顧客", "移除「約好」品牌標示", "營收與爽約率分析", "顧客名單匯出 CSV", "自訂品牌色"],
  },
  business: {
    id: "business",
    name: "商務版",
    price: 1299,
    tagline: "多位設計師、多張椅子的門市",
    maxStaff: Infinity,
    monthlyBookings: Infinity,
    removeBranding: true,
    csvExport: true,
    analytics: true,
    reminders: true,
    features: ["專業版全部功能", "服務人員不限人數", "優先客服支援", "新功能搶先體驗"],
  },
};

export const PLAN_ORDER: Plan[] = ["free", "pro", "business"];

export function planOf(plan: string): PlanDef {
  return PLANS[(plan as Plan) in PLANS ? (plan as Plan) : "free"];
}

export const CATEGORIES: Record<string, string> = {
  hair: "美髮沙龍",
  nail: "美甲美睫",
  beauty: "美容 SPA",
  fitness: "健身教練",
  massage: "按摩推拿",
  tutor: "家教課程",
  photo: "攝影工作室",
  pet: "寵物美容",
  other: "其他服務",
};

/** 各產業的預設服務，註冊後自動建立，降低上手門檻 */
export const CATEGORY_TEMPLATES: Record<string, { name: string; duration: number; price: number; description: string }[]> = {
  hair: [
    { name: "洗剪", duration: 60, price: 800, description: "含洗髮、剪髮與造型吹整" },
    { name: "染髮", duration: 120, price: 2500, description: "單色染，依髮長現場報價" },
    { name: "燙髮", duration: 180, price: 3200, description: "含前後護髮" },
  ],
  nail: [
    { name: "手部單色凝膠", duration: 60, price: 900, description: "含基礎保養與甘皮修整" },
    { name: "手部造型凝膠", duration: 90, price: 1500, description: "可自帶圖，款式現場討論" },
    { name: "睫毛嫁接 120 根", duration: 90, price: 1800, description: "自然款，含卸除舊睫毛" },
  ],
  beauty: [
    { name: "基礎保濕課程", duration: 60, price: 1200, description: "清潔、去角質、保濕敷膜" },
    { name: "深層清粉刺", duration: 90, price: 1800, description: "含鎮定修護" },
  ],
  fitness: [
    { name: "一對一私人課", duration: 60, price: 1500, description: "依個人目標安排訓練內容" },
    { name: "體驗課", duration: 50, price: 600, description: "首次限定，含體態評估" },
  ],
  massage: [
    { name: "全身指壓", duration: 60, price: 1200, description: "" },
    { name: "精油舒壓", duration: 90, price: 1900, description: "" },
  ],
  tutor: [
    { name: "一對一課程", duration: 60, price: 800, description: "" },
    { name: "試聽課", duration: 30, price: 0, description: "免費，了解程度與需求" },
  ],
  photo: [
    { name: "形象照拍攝", duration: 60, price: 2800, description: "含 5 張精修" },
    { name: "證件照", duration: 30, price: 600, description: "" },
  ],
  pet: [
    { name: "小型犬洗澡", duration: 60, price: 600, description: "" },
    { name: "小型犬美容", duration: 120, price: 1200, description: "洗澡加造型修剪" },
  ],
  other: [{ name: "一般預約", duration: 60, price: 1000, description: "" }],
};
