import { site } from "@/lib/site";

/** 條款開頭的營運者資訊。未設定 OPERATOR_NAME 時提醒這還是範本 */
export function Operator() {
  const { operator, support } = site();
  if (!operator) {
    return <p className="border border-ink/15 bg-sun-soft p-3 text-sm text-note">這是一份範本。正式營運前請設定 OPERATOR_NAME 與 SUPPORT_EMAIL，並依你的實際情況與法律顧問意見修訂內容。</p>;
  }
  return (
    <p className="text-sm text-muted">
      本服務「約好」由 {operator} 營運。
      {support && (
        <>
          聯絡信箱：<span className="text-ink">{support}</span>
        </>
      )}
    </p>
  );
}
