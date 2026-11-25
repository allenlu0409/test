/** 依品牌色亮度決定按鈕上的文字用深色或白色，確保對比 */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#13211c" : "#ffffff";
}

/** 預約頁用的品牌色：付費方案才套用店家自訂的顏色 */
export function brandVars(color: string, custom: boolean): Record<string, string> {
  const c = custom ? color : "#1d3fae";
  return { "--bc": c, "--bt": textOn(c) };
}
