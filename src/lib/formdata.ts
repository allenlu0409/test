// server action 共用的 FormData 讀取工具：一律修剪、限長、轉型，避免每個 action 各寫一套。
export function str(data: FormData, key: string, max = 200): string {
  return String(data.get(key) ?? "").trim().slice(0, max);
}

export function int(data: FormData, key: string): number {
  const n = Number(data.get(key));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
