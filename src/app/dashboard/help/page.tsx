import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { planOf, PLANS } from "@/lib/plans";
import { site } from "@/lib/site";

export const metadata = { title: "使用說明" };

type QA = [q: string, a: React.ReactNode];

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium text-brand underline underline-offset-4">
    {children}
  </Link>
);

export default async function HelpPage() {
  const { biz } = await requireBusiness();
  const { support } = site();
  const free = PLANS.free;

  const groups: [title: string, items: QA[]][] = [
    [
      "讓客人開始預約",
      [
        ["預約連結要放在哪裡？", <>最有效的三個地方：IG 個人檔案的「連結」、LINE 官方帳號的圖文選單或自動回覆、Google 商家檔案的「預約」欄位。客人傳訊息問時間時，也可以直接回這條連結。連結和 QR Code 在 <L href="/dashboard/settings">店家設定</L>。</>],
        ["QR Code 怎麼用？", <>到 <L href="/dashboard/settings">店家設定</L> 下載後印出來，放在櫃檯或鏡子旁。客人結帳時掃一下，就能順手約下一次。</>],
        ["客人需要註冊或下載 App 嗎？", "不用。客人打開連結，選服務、選時間、留姓名和手機就完成，全程在手機瀏覽器裡。"],
        ["客人說約不到時間，為什麼？", <>依序檢查：一、<L href="/dashboard/hours">營業時間</L> 那天是不是公休；二、「最晚需提前」是不是設得太長；三、那個時段是不是已經有預約，或服務時間太長排不進去；四、<L href="/dashboard/staff">服務人員</L> 是不是被設成休假，或沒有勾選那項服務。</>],
      ],
    ],
    [
      "每天怎麼用",
      [
        ["電話或 LINE 來的預約怎麼記？", <>到 <L href="/dashboard/bookings?new=1">預約</L> 用「手動新增預約」。記進來之後，那個時段就不會再被線上的客人約走。現場客沒留電話可以空白。手動預約不受營業時間限制，也不算在每月線上預約額度裡。</>],
        ["客人來了、沒來，要做什麼？", "服務結束後在預約列表按「完成」，營收和來店次數才會算進去。客人沒出現就按「未到」，那位客人的名單上會標記未到次數。按錯了可以在「過去」分頁按「復原」。"],
        ["客人要改時間怎麼辦？", "客人可以從自己的預約連結按「改時間」自己改，你會收到通知信。你也可以在預約列表按「改期」直接幫他改。"],
        ["客人可以自己取消嗎？", <>可以，從預約連結就能取消或改期，時段會立刻重新開放，你會收到通知信。你可以在 <L href="/dashboard/hours">營業時間</L> 的預約規則設定「開始前幾小時內不能再改」，超過期限的客人會被請去直接聯繫你。</>],
        ["怎麼提醒客人？可以用 LINE 嗎？", <>有留 Email 的客人，前一天會自動收到提醒信。沒留的客人，<L href="/dashboard">總覽</L> 的「明天的預約」每一筆都有「複製提醒」，貼到你和客人的 LINE 對話就好。每晚八點後，我們也會寄一封「明天的預約」給你。</>],
        ["午休或有私事，怎麼不讓客人約那段時間？", <>到 <L href="/dashboard/bookings">預約</L> 的「保留時段」，選日期和時間，可以針對全店或某一位人員。每筆預約之間想留整理時間，則到 <L href="/dashboard/hours">營業時間</L> 設定「每筆預約之間保留」。</>],
        ["常爽約的客人可以擋掉嗎？", <>到 <L href="/dashboard/hours">營業時間</L> 的預約規則，設定「未到幾次後不能線上預約」。以手機號碼計算，被擋下的客人會看到「請直接與店家聯繫」。</>],
        ["怎麼設定臨時公休？", <>到 <L href="/dashboard/hours">營業時間</L> 最下方的「臨時公休日」新增日期。那天已經約好的預約不會自動取消，請記得個別聯繫客人。</>],
      ],
    ],
    [
      "服務與人員",
      [
        ["客人一次要做兩項（例如卸甲加凝膠），怎麼約？", <>目前一筆預約是一項服務。常見的組合請直接建成一項，例如「卸甲＋單色凝膠」，時長和價格填合計。到 <L href="/dashboard/services">服務項目</L> 新增。</>],
        ["服務的「時長」會影響什麼？", "時長決定一筆預約會占用多久。例如 2 小時的染髮約在 14:00，同一位人員 14:00 到 16:00 之間就不會再開放其他預約。"],
        ["有的設計師不做某些服務，怎麼設定？", <>到 <L href="/dashboard/staff">服務人員</L>，把他不做的服務取消勾選。客人選那項服務時就不會看到他。</>],
        ["每個人休假日不一樣怎麼辦？", <>在 <L href="/dashboard/staff">服務人員</L> 勾選每個人「每週固定休假」的星期。臨時請假則用「設為休假」暫停接單，回來再恢復。</>],
        ["刪掉服務或人員，以前的紀錄會不見嗎？", "不會。過去的預約和營收都會保留，只是之後不能再約這項服務或這位人員。"],
      ],
    ],
    [
      "方案與付款",
      [
        ["免費版有什麼限制？", `${free.maxStaff} 位服務人員、每月 ${free.monthlyBookings} 筆線上預約，預約頁下方會有「約好」的標示。沒有使用期限。額度用到八成和用完時我們會寄信通知你。`],
        ["額度用完了會怎樣？", "客人還是可以照常預約，你的預約頁不會關閉。不過到下個月 1 號之前，新進來的預約只會顯示姓名和時間，顧客電話要升級後才看得到。升級後，已經收到的預約也會立刻顯示完整資料。"],
        ["怎麼付款？可以取消嗎？", <>在 <L href="/dashboard/billing">方案與帳單</L> 用信用卡訂閱，之後自動扣款，可選月繳或年繳。隨時可以取消，取消後付費功能可以用到當期結束，之後自動回到免費版，資料全部保留。</>],
        ["扣款失敗會怎樣？", "我們會寄信通知你，付費功能再保留 3 天。期間到「方案與帳單」重新訂閱就不會中斷。"],
      ],
    ],
    [
      "帳號與資料",
      [
        ["客人要求刪除他的資料？", <>到 <L href="/dashboard/customers">顧客</L> 點開那位顧客，按「刪除這位顧客的個人資料」。姓名、手機、Email 和備註會被清除，過去的預約金額仍保留供你對帳。</>],
        ["怎麼把資料匯出？", `顧客名單和預約明細都可以匯出成 CSV（${PLANS.pro.name}以上），用 Excel 就能打開。`],
        ["怎麼讓帳號更安全？", <>到 <L href="/dashboard/settings#two-step">店家設定</L> 開啟兩步驟驗證。之後登入除了密碼，還要輸入手機驗證器上的驗證碼。</>],
        ["收不到通知信？", "先確認信箱已經驗證（沒驗證時後台上方會有提示），再看看垃圾信匣。通知只會寄到註冊時的信箱。"],
      ],
    ],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">使用說明</h1>
        <p className="mt-1 text-sm text-muted">
          你目前是{planOf(biz.plan).name}。找不到答案的話，
          {support ? (
            <>
              寫信到 <span className="font-medium text-ink">{support}</span>，我們會回覆你。
            </>
          ) : (
            "直接回覆任何一封我們寄給你的信。"
          )}
        </p>
      </div>
      {groups.map(([title, items]) => (
        <section key={title} className="grid gap-x-10 gap-y-3 lg:grid-cols-[11rem_1fr]">
          <h2 className="font-display text-xl">{title}</h2>
          <div className="panel divide-y divide-line">
            {items.map(([q, a]) => (
              <details key={q} className="group px-5 py-3.5">
                <summary className="flex list-none items-baseline justify-between gap-4 font-medium">
                  {q}
                  <span className="shrink-0 text-sm font-normal text-muted group-open:hidden">展開</span>
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/80">{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
