import { DashboardView } from "./dashboard-view";

export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-[color:var(--muted-foreground)] mt-2">
        Cost, spend cap, recent runs.
      </p>
      <div className="mt-8">
        <DashboardView />
      </div>
    </div>
  );
}
