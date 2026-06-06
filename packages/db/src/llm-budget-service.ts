import Decimal from "decimal.js";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  DEFAULT_DAILY_LLM_BUDGET_USD,
  budgetDayKey,
  compareBudget,
  startOfBudgetDayUtc,
  type LlmBudgetStatus,
  type LlmUsageRecord,
} from "@ca-suite/shared";
import { db } from "./client";
import { appSettings, llmUsageEvents } from "./schema/llm-budget";
import { uploads } from "./schema/documents";
import { gstDocuments } from "./schema/gst";

export type { LlmBudgetStatus, LlmUsageRecord };

export async function ensureAppSettings() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, "default")).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(appSettings)
    .values({ id: "default", dailyLlmBudgetUsd: String(DEFAULT_DAILY_LLM_BUDGET_USD) })
    .returning();
  return created;
}

export async function getDailyBudgetUsd(): Promise<string> {
  const row = await ensureAppSettings();
  return row.dailyLlmBudgetUsd ?? String(DEFAULT_DAILY_LLM_BUDGET_USD);
}

export async function setDailyBudgetUsd(amountUsd: number): Promise<string> {
  const value = new Decimal(amountUsd).toFixed(6);
  await ensureAppSettings();
  const [row] = await db
    .update(appSettings)
    .set({ dailyLlmBudgetUsd: value, updatedAt: new Date() })
    .where(eq(appSettings.id, "default"))
    .returning();
  return row.dailyLlmBudgetUsd ?? value;
}

export async function getTodaySpendUsd(): Promise<string> {
  const dayStart = startOfBudgetDayUtc();
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${llmUsageEvents.costUsd}::numeric), 0)::text`,
    })
    .from(llmUsageEvents)
    .where(gte(llmUsageEvents.createdAt, dayStart));
  return row?.total ?? "0";
}

export async function getLlmBudgetStatus(): Promise<LlmBudgetStatus> {
  const budgetStr = await getDailyBudgetUsd();
  const spentStr = await getTodaySpendUsd();
  const { canSpend, remaining } = compareBudget(spentStr, budgetStr);
  return {
    budget_day: budgetDayKey(),
    daily_budget_usd: parseFloat(budgetStr),
    spent_today_usd: parseFloat(spentStr),
    remaining_today_usd: parseFloat(remaining),
    can_spend: canSpend,
  };
}

export async function recordLlmUsage(input: {
  tenantId: string;
  uploadId?: string | null;
  documentId?: string | null;
  stage: string;
  usage: LlmUsageRecord;
}) {
  const cost = new Decimal(input.usage.cost_usd).toFixed(6);
  await db.insert(llmUsageEvents).values({
    tenantId: input.tenantId,
    uploadId: input.uploadId ?? null,
    documentId: input.documentId ?? null,
    stage: input.stage,
    model: input.usage.model,
    promptTokens: input.usage.prompt_tokens,
    completionTokens: input.usage.completion_tokens,
    costUsd: cost,
  });

  if (input.documentId) {
    await db
      .update(gstDocuments)
      .set({
        llmCostUsd: sql`${gstDocuments.llmCostUsd}::numeric + ${cost}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(gstDocuments.id, input.documentId));
  }
}

export async function deferUploadForBudget(
  uploadId: string,
  resumeStage: string,
  documentId?: string | null
) {
  await db
    .update(uploads)
    .set({
      budgetDeferred: true,
      budgetResumeStage: resumeStage,
      budgetResumeDocumentId: documentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(uploads.id, uploadId));
}

export async function listDeferredUploads(limit = 100) {
  return db
    .select({
      id: uploads.id,
      tenantId: uploads.tenantId,
      originalFilename: uploads.originalFilename,
      currentStage: uploads.currentStage,
      budgetResumeStage: uploads.budgetResumeStage,
      budgetResumeDocumentId: uploads.budgetResumeDocumentId,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(eq(uploads.budgetDeferred, true))
    .orderBy(uploads.createdAt)
    .limit(limit);
}

export async function listRecentLlmUsage(limit = 50) {
  return db
    .select({
      id: llmUsageEvents.id,
      tenantId: llmUsageEvents.tenantId,
      uploadId: llmUsageEvents.uploadId,
      documentId: llmUsageEvents.documentId,
      stage: llmUsageEvents.stage,
      model: llmUsageEvents.model,
      promptTokens: llmUsageEvents.promptTokens,
      completionTokens: llmUsageEvents.completionTokens,
      costUsd: llmUsageEvents.costUsd,
      createdAt: llmUsageEvents.createdAt,
    })
    .from(llmUsageEvents)
    .orderBy(desc(llmUsageEvents.createdAt))
    .limit(limit);
}

export type ResumeDeferredHandler = (
  upload: {
    id: string;
    tenantId: string;
    budgetResumeStage: string | null;
    budgetResumeDocumentId: string | null;
    currentStage: string | null;
  }
) => Promise<void>;

export async function resumeDeferredUploads(enqueue: ResumeDeferredHandler): Promise<number> {
  const status = await getLlmBudgetStatus();
  if (!status.can_spend) return 0;

  const deferred = await listDeferredUploads(500);
  let resumed = 0;

  for (const u of deferred) {
    const fresh = await getLlmBudgetStatus();
    if (!fresh.can_spend) break;

    await db
      .update(uploads)
      .set({
        budgetDeferred: false,
        budgetResumeStage: null,
        budgetResumeDocumentId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(uploads.id, u.id), eq(uploads.budgetDeferred, true)));

    const resumeStage =
      u.budgetResumeStage ??
      (u.currentStage === "received" ? "normalize" : u.currentStage === "normalized" ? "ocr" : "normalize");

    await enqueue({
      id: u.id,
      tenantId: u.tenantId,
      budgetResumeStage: resumeStage,
      budgetResumeDocumentId: u.budgetResumeDocumentId,
      currentStage: u.currentStage,
    });
    resumed += 1;
  }

  return resumed;
}
