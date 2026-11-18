import { Logo } from "@/components/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo />
      <article className="mt-10 space-y-4 text-[15px] leading-relaxed text-ink/85 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:text-ink [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
    </main>
  );
}
