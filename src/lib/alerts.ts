// 讓營運者不用每天進後台看：有異常才寄信，另外每週一寄一封摘要。
import { monthlyRecurringRevenue, pendingEcpayCancels } from "./billing.ts";
import { all, get, getMeta, setMeta } from "./db.ts";
import { sendMail } from "./mail.ts";
import { backupDir, dbFile } from "./maintenance.ts";
import { appUrl } from "./stripe.ts";
import { fmtMoney, nowInTz, weekdayOf } from "./time.ts";
import fs from "node:fs";

const DEMO = "demo@yuehao.app";

function admins(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export interface Alert {
  key: string;
  text: string;
}

/** 目前需要人處理的狀況 */
export function collectAlerts(at: Date = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const n = (sql: string) => get<{ n: number }>(sql)!.n;

  const mailFails = n("SELECT COUNT(*) AS n FROM mail_log WHERE status LIKE 'failed%' AND created_at >= datetime('now', '-1 day')");
  if (mailFails >= 3) alerts.push({ key: "mail", text: `過去 24 小時有 ${mailFails} 封信寄送失敗。請到 Resend 後台確認額度與網域驗證。` });

  const stuck = pendingEcpayCancels().filter((c) => c.attempts >= 6);
  if (stuck.length) alerts.push({ key: `ecpay-cancel:${stuck.map((c) => c.trade_no).join(",")}`, text: `有 ${stuck.length} 筆綠界定期定額重試多次仍無法終止（${stuck.map((c) => c.trade_no).join("、")}）。請到綠界廠商後台手動停用，避免店家被重複扣款。` });

  const orphans = n("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'orphan-charge' AND created_at >= datetime('now', '-1 day')");
  if (orphans) alerts.push({ key: `orphan:${orphans}`, text: `過去 24 小時有 ${orphans} 筆扣款沒有對應的方案（稽核紀錄 orphan-charge）。請到綠界後台退款。` });

  const failedCharges = n("SELECT COUNT(*) AS n FROM payments WHERE status = 'failed' AND created_at >= datetime('now', '-1 day')");
  if (failedCharges) alerts.push({ key: `charge:${failedCharges}`, text: `過去 24 小時有 ${failedCharges} 筆訂閱扣款失敗。系統已寄信請店家更新付款方式，3 天內聯繫挽回率最高。` });

  if (dbFile() !== ":memory:") {
    let newest = "";
    try {
      newest = fs.readdirSync(backupDir()).filter((f) => /^yuehao-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().pop() ?? "";
    } catch {
      // 備份資料夾還不存在
    }
    const today = nowInTz("Asia/Taipei", at).date;
    const twoDaysAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);
    const shops = n("SELECT COUNT(*) AS n FROM businesses");
    if (shops > 0 && newest.slice(7, 17) < twoDaysAgo) alerts.push({ key: "backup", text: `每日備份已經超過兩天沒有成功${newest ? `（最新一份是 ${newest.slice(7, 17)}）` : "（還沒有任何備份）"}。請檢查磁碟空間。` });
  }
  return alerts;
}

/** 有異常才寄；同樣的異常一天只寄一次。回傳寄出的異常數 */
export async function sendOperatorAlerts(at: Date = new Date()): Promise<number> {
  const to = admins();
  const alerts = collectAlerts(at);
  if (!to.length || !alerts.length) return 0;
  const stamp = `${nowInTz("Asia/Taipei", at).date}|${alerts.map((a) => a.key).join("|")}`;
  if (getMeta("alerts:last") === stamp) return 0;
  setMeta("alerts:last", stamp);
  for (const addr of to) {
    await sendMail({
      to: addr,
      subject: `約好需要你處理：${alerts.length} 件事`,
      text: `${alerts.map((a, i) => `${i + 1}. ${a.text}`).join("\n\n")}\n\n營運後台：${appUrl()}/admin`,
    });
  }
  return alerts.length;
}

/** 每週一早上 9 點後寄一次：上週的生意概況 */
export async function sendWeeklyDigest(at: Date = new Date()): Promise<boolean> {
  const to = admins();
  const now = nowInTz("Asia/Taipei", at);
  if (!to.length || weekdayOf(now.date) !== 1 || now.minutes < 9 * 60 || getMeta("digest:last") === now.date) return false;
  setMeta("digest:last", now.date);

  const t = get<{ shops: number; paid: number; fresh: number; active: number }>(
    `SELECT COUNT(*) AS shops,
            COUNT(CASE WHEN b.plan != 'free' THEN 1 END) AS paid,
            COUNT(CASE WHEN b.created_at >= datetime('now', '-7 days') THEN 1 END) AS fresh,
            COUNT(CASE WHEN EXISTS (SELECT 1 FROM bookings k WHERE k.business_id = b.id AND k.created_at >= datetime('now', '-7 days')) THEN 1 END) AS active
     FROM businesses b JOIN users u ON u.id = b.owner_id WHERE u.email != ?`,
    DEMO,
  )!;
  const bookings = get<{ n: number }>("SELECT COUNT(*) AS n FROM bookings k JOIN businesses b ON b.id = k.business_id JOIN users u ON u.id = b.owner_id WHERE u.email != ? AND k.created_at >= datetime('now', '-7 days')", DEMO)!.n;
  const collected = get<{ n: number | null }>("SELECT SUM(amount) AS n FROM payments WHERE status = 'paid' AND created_at >= datetime('now', '-7 days')")!.n ?? 0;
  const idle = all<{ name: string; email: string }>(
    `SELECT b.name, u.email FROM businesses b JOIN users u ON u.id = b.owner_id
     WHERE u.email != ? AND b.created_at >= datetime('now', '-14 days') AND b.created_at < datetime('now', '-3 days')
       AND NOT EXISTS (SELECT 1 FROM bookings k WHERE k.business_id = b.id AND k.source = 'online') LIMIT 10`,
    DEMO,
  );
  const lines = [
    `每月經常性收入：${fmtMoney(monthlyRecurringRevenue(DEMO))}（上週實收 ${fmtMoney(collected)}）`,
    `店家：${t.shops} 間，其中付費 ${t.paid} 間；上週新增 ${t.fresh} 間`,
    `上週有預約的店家：${t.active} 間，共 ${bookings} 筆預約`,
    idle.length ? `\n開店超過三天還沒收到線上預約的店家（最值得主動聯繫）：\n${idle.map((s) => `・${s.name}　${s.email}`).join("\n")}` : "",
    collectAlerts(at).length ? `\n目前有 ${collectAlerts(at).length} 件事需要處理，詳見營運後台。` : "\n目前沒有需要處理的異常。",
  ];
  for (const addr of to) await sendMail({ to: addr, subject: `約好週報｜${now.date}`, text: `${lines.filter(Boolean).join("\n")}\n\n營運後台：${appUrl()}/admin` });
  return true;
}
