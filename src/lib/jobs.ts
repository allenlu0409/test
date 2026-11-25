// 所有定期工作的單一入口；每一項都可安全重複執行，其中一項失敗不影響其他項。
import { expireOverdue, processEcpayCancellations } from "./billing.ts";
import { cancelPeriod, ecpayConfig } from "./ecpay.ts";
import { backupDatabase, pruneExpired } from "./maintenance.ts";
import { notifyBilling, sendDueReminders } from "./notify.ts";
import { nowInTz } from "./time.ts";

export interface JobReport {
  reminders: number;
  expired: number;
  backup: string | null;
  errors: string[];
}

export async function runScheduledJobs(at: Date = new Date()): Promise<JobReport> {
  const report: JobReport = { reminders: 0, expired: 0, backup: null, errors: [] };
  const attempt = async (name: string, fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      console.error(`job ${name} failed`, e);
      report.errors.push(name);
    }
  };
  await attempt("reminders", async () => (report.reminders = await sendDueReminders(at)));
  await attempt("expire", async () => {
    const ids = expireOverdue(Math.floor(at.getTime() / 1000));
    report.expired = ids.length;
    for (const id of ids) await notifyBilling(id, "expired");
  });
  await attempt("ecpay-cancel", async () => {
    if (ecpayConfig().merchantId) await processEcpayCancellations((t) => cancelPeriod(t));
  });
  await attempt("prune", () => pruneExpired(at.getTime()));
  await attempt("backup", () => (report.backup = backupDatabase(nowInTz("Asia/Taipei", at).date)));
  return report;
}
