import { getRun } from "workflow/api";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const rows = await getDb()
    .select({ workflowRunId: schema.runs.workflowRunId })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId))
    .limit(1);
  const workflowRunId = rows[0]?.workflowRunId;
  if (!workflowRunId) {
    return new Response("Run not found", { status: 404 });
  }
  const run = getRun(workflowRunId);
  const stream = run.getReadable();
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
