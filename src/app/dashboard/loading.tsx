export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="載入中">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-line/70" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/50" />
      <div className="h-64 animate-pulse rounded-2xl bg-line/40" />
    </div>
  );
}
