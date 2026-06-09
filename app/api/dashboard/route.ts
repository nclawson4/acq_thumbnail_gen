import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { desc, sql } from "drizzle-orm";
import { getTodayDemoSpend } from "@/lib/cost";

export async function GET() {
  const db = getDb();
  const recentRuns = await db
    .select()
    .from(schema.runs)
    .orderBy(desc(schema.runs.createdAt))
    .limit(20);
  const costByMode = await db
    .select({
      mode: schema.costLog.accessMode,
      total: sql<number>`coalesce(sum(${schema.costLog.estimatedUsd}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.costLog)
    .groupBy(schema.costLog.accessMode);
  const costByStep = await db
    .select({
      step: schema.costLog.step,
      total: sql<number>`coalesce(sum(${schema.costLog.estimatedUsd}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.costLog)
    .groupBy(schema.costLog.step)
    .orderBy(sql`sum(${schema.costLog.estimatedUsd}) desc`)
    .limit(20);

  const todayDemoSpend = await getTodayDemoSpend();

  return NextResponse.json({
    recentRuns,
    costByMode,
    costByStep,
    todayDemoSpend,
    dailyCap: Number(process.env.DEMO_DAILY_SPEND_CAP_USD ?? "5"),
  });
}
