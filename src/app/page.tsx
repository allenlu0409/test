import Link from "next/link";
import { Logo } from "@/components/brand";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { site } from "@/lib/site";
import { demoLogin } from "./actions/auth";

const BEFORE_AFTER = [
  ["「請問週六下午還有位置嗎？」", "客人打開預約頁就看得到所有空檔，自己選好，不用等你回。"],
  ["晚上十一點才傳來的訊息", "預約頁不打烊。你在睡覺，預約本自己多了一行。"],
  ["紙本、LINE 記事本、腦袋各記一半", "所有預約寫在同一本，每位設計師一欄，不會撞期。"],
  ["「不好意思我忘記了…」", "有留 Email 的客人，前一天會收到提醒信；你也可以一鍵複製提醒文字貼到 LINE。臨時不能來，客人能自己改期或取消，時段馬上還給你。"],
];

const FEATURES = [
  ["預約頁", "一條連結，放在 IG 個人檔案、LINE 官方帳號選單或 Google 商家檔案。也能印成 QR Code 立在櫃檯。"],
  ["價目與時長", "每項服務各自設定要多久、多少錢。客人預約前就清楚，你也不會排到做不完。"],
  ["每個人一欄", "每位服務人員有自己的行程、會做的服務和固定休假。同一個時段只會被訂走一次，客人可以指定設計師。"],
  ["營業時間與保留時段", "每週固定時段、臨時公休、午休或私事的保留時段，還能在每筆預約之間留整理時間。"],
  ["顧客名單", "自動記下來店次數、消費金額和上次什麼時候來。偏好與禁忌寫在備註裡。"],
  ["月底看帳", "每天做了多少、哪項服務最賺、多少人沒來，打開就看得到。"],
];

const FAQ = [
  ["客人需要下載 App 或註冊會員嗎？", "不用。客人打開你的預約連結，選服務、選時間、留姓名電話就完成，全程在手機瀏覽器裡。"],
  ["免費版可以用多久？", "沒有期限。免費版是 1 位服務人員、每月 30 筆線上預約。超過之後客人還是約得進來，你的預約頁不會關；只是新預約的顧客電話要升級後才看得到。"],
  ["提醒是用 LINE 嗎？", "不是，目前是 Email。客人預約時有留 Email，前一天會收到提醒信。沒留的客人，後台「明天的預約」每一筆都有可以直接複製的提醒文字，貼到你和客人的 LINE 對話就好。客人也可以把預約明細傳到自己的 LINE。"],
  ["客人都用 LINE 跟我約，怎麼辦？", "把預約連結放在 LINE 裡就好：官方帳號的選單、自動回覆，或直接貼在對話。客人一樣從 LINE 點進來，只是不用等你回。"],
  ["顧客名單是誰的？你們收掉怎麼辦？", "名單是你的。專業版以上可以隨時把顧客和預約匯出成 Excel 能開的檔案，也可以把整個帳號連同資料刪除。"],
  ["可以隨時取消訂閱嗎？", "可以。在後台的「方案與帳單」隨時取消，當期結束後自動回到免費版，資料都會保留。"],
  ["客人臨時要改時間怎麼辦？", "每筆預約都有專屬的連結，客人可以自己改期或取消，你會收到通知；也可以在後台直接幫客人改。你能設定「開始前幾小時內不能再改」。"],
  ["電話或 LINE 來的預約也能記進來嗎？", "可以。後台能手動新增預約，空檔會同步更新，線上的客人就不會約到同一個時段。"],
];

/** 首頁主視覺：一頁預約本。藍筆是既有的預約，螢光筆那一行是剛剛客人自己約進來的 */
function BookPage() {
  const rows: [time: string, entry?: string, state?: "new" | "gone"][] = [
    ["10:00", "洗剪　陳小姐"],
    ["11:00"],
    ["12:00", "男士剪髮　周先生"],
    ["13:00", "溫塑燙　黃小姐", "gone"],
    ["14:00", "設計染髮　林小姐", "new"],
    ["15:00", "　〃"],
    ["16:00"],
    ["17:00", "頭皮養護　吳小姐"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="border border-ink/80 bg-white">
        <div className="flex items-baseline justify-between border-b-2 border-ink px-5 py-3">
          <p className="font-display text-xl">十一月二十一日　星期六</p>
          <p className="text-sm text-muted">Mia</p>
        </div>
        <ul>
          {rows.map(([time, entry, state]) => (
            <li key={time} className="flex h-11 items-center border-b border-line last:border-b-0">
              <span className="tnum w-16 shrink-0 border-r border-seal/40 pl-5 text-sm text-muted">{time}</span>
              <span className={`pl-4 text-[15px] ${state === "gone" ? "text-muted line-through decoration-seal" : "text-brand"}`}>
                {state === "new" ? <span className="hl font-semibold">{entry}</span> : entry}
              </span>
              {state === "gone" && <span className="ml-3 text-xs text-seal">客人自己取消</span>}
            </li>
          ))}
        </ul>
      </div>
      <span className="stamp stamp-in absolute right-6 top-[14.9rem] text-3xl">約好</span>
      <p className="mt-3 text-right text-xs text-muted">螢光筆那一行，是客人半夜自己約進來的。</p>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  // 從店家預約頁點過來的訪客：把介紹來源帶到註冊
  const ref = ((await searchParams).ref ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 30);
  const signupHref = ref ? `/signup?ref=${ref}` : "/signup";
  const { operator, support } = site();
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-20 border-b border-ink/15 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-3">
            <a href="#features" className="hidden px-2 py-2 text-sm text-muted hover:text-ink sm:block">
              功能
            </a>
            <a href="#pricing" className="hidden px-2 py-2 text-sm text-muted hover:text-ink sm:block">
              價目表
            </a>
            <Link href="/login" className="px-2 py-2 text-sm font-medium underline-offset-4 hover:underline">
              登入
            </Link>
            <Link href={signupHref} className="btn btn-primary btn-sm">
              免費開始
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-x-16 gap-y-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          <div>
            <p className="font-semibold text-brand">給美甲師、美睫師、設計師、教練的預約本</p>
            <h1 className="mt-4 text-[2.9rem] leading-[1.15] sm:text-6xl lg:text-[4.4rem]">
              客人自己<span className="hl">約好</span>
              <br />
              你專心服務
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink/80">不用再一邊上染劑一邊回訊息喬時間。開一個預約頁，客人自己選服務、選時段，預約直接記進你的預約本。</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={signupHref} className="btn btn-primary px-7 py-3 text-base">
                免費開一個預約頁
              </Link>
              <Link href="/b/demo" className="btn btn-ghost px-7 py-3 text-base">
                先當客人約一次看看
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">一個人的店免費用，沒有期限。不用綁卡，客人不用下載 App。</p>
            <form action={demoLogin} className="mt-1">
              <button type="submit" className="min-h-11 text-sm text-ink underline underline-offset-4 hover:text-brand">
                也可以不註冊，直接看示範店家的後台
              </button>
            </form>
          </div>
          <BookPage />
        </section>

        <section className="border-y border-ink/15 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl">這些事，不用再做了</h2>
            <dl className="mt-8 border-t border-ink">
              {BEFORE_AFTER.map(([before, after]) => (
                <div key={before} className="grid gap-x-10 gap-y-1 border-b border-line py-5 sm:grid-cols-[1fr_1.3fr]">
                  <dt className="text-lg text-muted line-through decoration-seal/70 decoration-1">{before}</dt>
                  <dd className="text-lg">{after}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[0.8fr_1.7fr]">
            <h2 className="font-display text-3xl lg:sticky lg:top-24 lg:self-start">
              一本預約本
              <br />
              該有的東西
            </h2>
            <dl className="border-t border-ink">
              {FEATURES.map(([term, desc]) => (
                <div key={term} className="grid gap-x-8 gap-y-1 border-b border-line py-5 sm:grid-cols-[9rem_1fr]">
                  <dt className="font-display text-xl">{term}</dt>
                  <dd className="text-[15px] text-ink/80">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-y border-ink/15 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl">今天下午就能開始收預約</h2>
            <ol className="mt-8 grid border-t border-ink sm:grid-cols-3 sm:divide-x sm:divide-line">
              {[
                ["一", "填店名、選行業", "我們依行業先幫你列好常見的服務和營業時間，改一改就能用。"],
                ["二", "調整價目與時段", "每項服務多久、多少錢，每週哪幾天營業，最晚要提前多久約。"],
                ["三", "把連結貼出去", "IG 個人檔案、LINE 官方帳號、Google 商家，或印成 QR Code 放櫃檯。"],
              ].map(([n, t, d]) => (
                <li key={n} className="border-b border-line py-6 sm:border-b-0 sm:px-8 sm:first:pl-0 sm:last:pr-0">
                  <p className="font-display text-5xl text-brand">{n}</p>
                  <h3 className="mt-3 text-lg font-bold">{t}</h3>
                  <p className="mt-1 text-[15px] text-ink/80">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-4xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="font-display text-4xl">價目表</h2>
            <p className="text-sm text-muted">每月收費，不抽成、不收開通費，隨時可以取消。</p>
          </div>
          <div className="mt-8 border-t-2 border-ink">
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className="grid gap-x-8 gap-y-3 border-b border-ink/25 py-7 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <h3 className="font-display text-2xl">{id === "pro" ? <span className="hl">{p.name}</span> : p.name}</h3>
                      <span className="leader" aria-hidden="true" />
                      <p className="tnum font-display text-2xl">
                        NT${p.price.toLocaleString()}
                        <span className="ml-1 font-sans text-sm font-normal text-muted">／月</span>
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {p.tagline}
                      {id === "pro" && "。兩個人以上的店，從這個開始"}
                    </p>
                    <p className="mt-3 text-[15px] leading-relaxed text-ink/85">{p.features.join("・")}</p>
                  </div>
                  <div className="sm:self-center">
                    <Link href={signupHref} className={`btn w-full sm:w-36 ${id === "pro" ? "btn-primary" : "btn-ghost"}`}>
                      {id === "free" ? "免費開始" : "先免費試用"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-muted">付費方案都從免費版開始，覺得好用再到後台升級。年繳付 10 個月，用 12 個月。</p>
        </section>

        <section className="border-t border-ink/15">
          <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-6 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.7fr]">
            <h2 className="font-display text-3xl">常被問到的事</h2>
            <div className="border-t border-ink">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group border-b border-line py-4">
                  <summary className="flex list-none items-baseline justify-between gap-4 text-[17px] font-semibold">
                    {q}
                    <span className="shrink-0 text-sm font-normal text-muted group-open:hidden">展開</span>
                    <span className="hidden shrink-0 text-sm font-normal text-muted group-open:inline">收合</span>
                  </summary>
                  <p className="mt-2 max-w-2xl text-[15px] text-ink/80">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink/15 bg-paper"><div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-10 gap-y-6 px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            下一位客人，
            <br />
            自己約好
          </h2>
          <Link href={signupHref} className="btn btn-primary px-8 py-3.5 text-base">
            免費開一個預約頁
          </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/15">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-muted sm:px-6">
          {(operator || support) && (
            <p className="max-w-2xl text-ink/80">
              {operator && <>約好由 {operator} 在台灣開發與維運。</>}
              {support && (
                <>
                  有問題直接寫信：<span className="font-medium text-ink">{support}</span>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <div className="flex gap-5">
              <Link href="/terms" className="hover:text-ink">
                服務條款
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                隱私權政策
              </Link>
            </div>
            <p>© {new Date().getFullYear()} 約好 Yuehao</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
