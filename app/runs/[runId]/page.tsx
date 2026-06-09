import { RunViewer } from "./run-viewer";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Run <span className="font-mono text-[color:var(--muted-foreground)]">{runId.slice(0, 8)}</span>
      </h1>
      <p className="text-[color:var(--muted-foreground)] mt-1">
        Live progress streamed from the workflow.
      </p>
      <div className="mt-8">
        <RunViewer runId={runId} />
      </div>
    </div>
  );
}
