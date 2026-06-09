import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id"),
    youtubeUrl: text("youtube_url").notNull(),
    youtubeId: text("youtube_id").notNull(),
    videoTitle: text("video_title"),
    styleId: text("style_id"),
    hostSide: text("host_side").notNull().default("right"),
    status: text("status").notNull().default("queued"),
    currentStep: text("current_step"),
    finalUrls: jsonb("final_urls").$type<string[]>(),
    chosenVariant: text("chosen_variant"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    accessMode: text("access_mode").notNull().default("demo"),
  },
  (t) => [index("runs_created_at_idx").on(t.createdAt)],
);

export const stylePresets = pgTable("style_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  styleGuide: jsonb("style_guide").notNull(),
  referenceUrls: jsonb("reference_urls").$type<string[]>().notNull(),
  isBuiltin: integer("is_builtin").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const costLog = pgTable(
  "cost_log",
  {
    id: text("id").primaryKey(),
    runId: text("run_id"),
    step: text("step").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedUsd: doublePrecision("estimated_usd").notNull().default(0),
    accessMode: text("access_mode").notNull().default("demo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("cost_log_created_at_idx").on(t.createdAt),
    index("cost_log_access_mode_idx").on(t.accessMode),
  ],
);

export const evalResults = pgTable(
  "eval_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id"),
    videoUrl: text("video_url").notNull(),
    check: text("check").notNull(),
    passed: integer("passed").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("eval_results_created_at_idx").on(t.createdAt)],
);

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type StylePreset = typeof stylePresets.$inferSelect;
export type NewStylePreset = typeof stylePresets.$inferInsert;
export type CostLog = typeof costLog.$inferSelect;
export type EvalResult = typeof evalResults.$inferSelect;
