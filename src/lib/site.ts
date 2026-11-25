// 營運者資訊：由環境變數帶入條款、頁尾與信件，不必改程式。
export function site() {
  return {
    /** 條款與隱私權政策上的營運者名稱（公司名或你的姓名） */
    operator: process.env.OPERATOR_NAME || "",
    /** 客服信箱 */
    support: process.env.SUPPORT_EMAIL || "",
  };
}
