import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <Logo />
      <div className="panel mt-8 w-full max-w-md p-6 sm:p-8">{children}</div>
    </div>
  );
}
