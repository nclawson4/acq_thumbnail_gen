import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await getDb()
    .select({
      id: schema.stylePresets.id,
      name: schema.stylePresets.name,
      description: schema.stylePresets.description,
      isBuiltin: schema.stylePresets.isBuiltin,
      referenceUrls: schema.stylePresets.referenceUrls,
      createdAt: schema.stylePresets.createdAt,
    })
    .from(schema.stylePresets)
    .orderBy(desc(schema.stylePresets.isBuiltin), desc(schema.stylePresets.createdAt));
  return NextResponse.json({ presets: rows });
}
