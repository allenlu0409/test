import Link from "next/link";
import { Logo } from "@/components/brand";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { demoLogin } from "./actions/auth";

const FEATURES = [
  ["專屬預約頁", "一條連結放在 IG、LINE 官方帳號或 Google 商家檔案，客人點進來就能約。"],
  ["不會撞期", "系統依每位服務人員的行程即時計算空檔，同一時段只會被訂走一次。"],
  ["服務與價目", "每項服務各自設定時長與價格，客人預約前就清楚要花多久、多少錢。"],
  ["顧客名單", "自動累積來店次數、消費金額與上次來店日，備註客人的偏好與禁忌。"],
  ["營業時間與公休", "每週固定時段加上臨時公休日，出國進修那幾天直接關掉。"],
  ["營收與爽約率", "每天的預約量、營收走勢與未到比例一眼看完，知道哪個服務最賺。"],
];

const FAQ = [
  ["客人需要下載 App 或註冊會員嗎？", "不用。客人打開你的預約連結，選服務、選時間、留姓名電話就完成，全程在手機瀏覽器裡。"],
  ["免費版可以用多久？", "沒有期限。免費版每月可收 30 筆線上預約、1 位服務人員，預約變多再升級就好。"],
  ["可以隨時取消訂閱嗎？", "可以。在後台的「方案與帳單」隨時取消，當期結束後自動回到免費版，資料都會保留。"],
  ["客人臨時要改時間怎麼辦？", "每筆預約都有專屬的管理連結，客人可以自行取消後重新預約；你也可以在後台直接幫客人調整。"],
  ["電話或 LINE 來的預約也能記進來嗎？", "可以。後台的「新增預約」能手動建立，行事曆與空檔會同步更新，線上的客人就不會約到同一個時段。"],
];

function HeroPreview() {
  const times = ["10:00", "10:30", "11:00", "13:30", "14:00", "15:30", "16:00", "17:30"];
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -right-3 -top-3 hidden rounded-xl bg-sun px-3 py-2 text-xs font-semibold text-ink shadow-lg sm:block">
        新預約・週六 14:00
      </div>
      <div className="rounded-3xl border border-line bg-white p-5 shadow-[0_24px_60px_-24px_rgba(11,107,83,0.45)]">
        <p className="text-xs text-muted">線上預約</p>
        <p className="mt-1 text-lg font-bold">木木髮藝 Mumu Hair</p>
        <div className="mt-4 rounded-xl bg-brand-soft p-3">
          <p className="text-sm font-semibold text-brand-dark">設計染髮</p>
          <p className="tnum text-xs text-brand-dark/80">2 小時 30 分・NT$2,800</p>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs">
          {["三", "四", "五", "六", "日", "一", "二"].map((d, i) => (
            <div key={d} className={`rounded-lg py-1.5 ${i === 3 ? "bg-ink text-white" : i === 5 ? "text-muted line-through" : "text-ink"}`}>
              <div className="text-[10px] opacity-70">{d}</div>
              <div className="tnum font-semibold">{18 + i}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {times.map((t, i) => (
            <div
              key={t}
              className={`tnum rounded-lg border py-1.5 text-center text-xs font-medium ${
                i === 4 ? "border-brand bg-brand text-white" : "border-line text-ink"
              }`}
            >
              {t}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-full bg-brand py-2.5 text-center text-sm font-semibold text-white">確認預約</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              功能
            </a>
            <a href="#pricing" className="hidden px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              價格
            </a>
            <Link href="/login" className="px-3 py-2 text-sm font-medium hover:text-brand">
              登入
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              免費開始
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark">
              給美髮、美甲美睫、教練與工作室的預約系統
            </p>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl lg:text-[3.4rem]">
              客人自己約，
              <br />
              你專心<span className="text-brand">服務</span>。
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              不用再一邊上染劑一邊回訊息喬時間。開一個預約頁，客人 24 小時自己選服務、選時段，行事曆自動排好。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="btn btn-primary px-7 py-3 text-base">
                免費開一個預約頁
              </Link>
              <form action={demoLogin}>
                <button type="submit" className="btn btn-ghost px-7 py-3 text-base">
                  免註冊，看示範後台
                </button>
              </form>
            </div>
            <p className="mt-4 text-sm text-muted">
              免綁卡・三分鐘設定完成・
              <Link href="/b/demo" className="underline underline-offset-4 hover:text-brand">
                看看客人看到的預約頁
              </Link>
            </p>
          </div>
          <HeroPreview />
        </section>

        <section className="border-y border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {[
              ["半夜 11 點的訊息", "客人常常下班後才想到要預約。預約頁不打烊，你睡覺時也在接單。"],
              ["「那週六下午還有嗎？」", "來回五則訊息才敲定一個時段。讓客人直接看到所有空檔，一次選好。"],
              ["記在腦袋裡的行程", "紙本、LINE 記事本、備忘錄各記一半。所有預約集中在一個行事曆。"],
            ].map(([t, d]) => (
              <div key={t}>
                <h2 className="font-bold">{t}</h2>
                <p className="mt-2 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-black tracking-tight">一間預約制的店，需要的都在這裡</h2>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, d]) => (
              <div key={t} className="border-t-2 border-ink pt-4">
                <h3 className="text-lg font-bold">{t}</h3>
                <p className="mt-2 text-[15px] text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight">三個步驟，今天就能開始收預約</h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                ["填店名、選產業", "系統依產業幫你建好常見的服務項目與營業時間，改一改就能用。"],
                ["調整服務與時段", "設定每項服務的時長與價格、每週營業時間、需要提前多久預約。"],
                ["把連結貼出去", "放到 IG 個人檔案、LINE 官方帳號選單、Google 商家，開始收單。"],
              ].map(([t, d], i) => (
                <li key={t}>
                  <span className="tnum text-5xl font-black text-sun">{i + 1}</span>
                  <h3 className="mt-3 text-lg font-bold">{t}</h3>
                  <p className="mt-2 text-[15px] text-white/70">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-black tracking-tight">先免費用，生意變好再升級</h2>
          <p className="mt-3 text-muted">所有方案都不抽成、不收設定費。一位客人回流一次，就超過一個月的月費。</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              const featured = id === "pro";
              return (
                <div
                  key={id}
                  className={`flex flex-col rounded-3xl border p-7 ${featured ? "border-brand bg-brand text-white" : "border-line bg-white"}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{p.name}</h3>
                    {featured && <span className="badge bg-sun text-ink">最多店家選擇</span>}
                  </div>
                  <p className={`mt-1 text-sm ${featured ? "text-white/80" : "text-muted"}`}>{p.tagline}</p>
                  <p className="mt-6">
                    <span className="tnum text-4xl font-black">NT${p.price.toLocaleString()}</span>
                    <span className={`text-sm ${featured ? "text-white/80" : "text-muted"}`}> / 月</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <svg width="18" height="18" viewBox="0 0 18 18" className="mt-1 shrink-0" aria-hidden="true">
                          <path d="M4 9.5l3.2 3.2L14 5.8" fill="none" stroke={featured ? "#f2b84b" : "#0b6b53"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className={`btn mt-8 ${featured ? "bg-white text-brand-dark hover:bg-sun-soft" : "btn-dark"}`}>
                    {id === "free" ? "免費開始" : "先免費試用，再升級"}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-line bg-paper">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight">常見問題</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex list-none items-center justify-between gap-4 font-semibold">
                    {q}
                    <span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[15px] text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">下一位客人，讓他自己約好。</h2>
          <Link href="/signup" className="btn btn-primary mt-8 px-8 py-3 text-base">
            免費開一個預約頁
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
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
      </footer>
    </div>
  );
}
