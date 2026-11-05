export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <p className="text-sm font-medium text-ink-soft">Loading your workspace…</p>
      <div aria-hidden="true" className="motion-safe:animate-pulse space-y-5">
        <div className="h-24 rounded-2xl bg-white border border-line" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((key) => <div key={key} className="h-28 rounded-2xl bg-white border border-line" />)}
        </div>
        <div className="h-64 rounded-2xl bg-white border border-line" />
      </div>
    </div>
  );
}
