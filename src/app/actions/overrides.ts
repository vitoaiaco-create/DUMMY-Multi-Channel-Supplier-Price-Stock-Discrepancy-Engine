"use server";

import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  masterCatalog,
  overrideAuditLog,
  supplierConfigs,
} from "@/db/schema";

export type OverrideActionResult =
  | { success: true }
  | { success: false; error: string };

const SCARCITY_REVIEW_DAYS = 14;

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (value == null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDbPct(rate: number): string {
  return (rate * 100).toFixed(2);
}

function ratesMatch(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

function formatSupplierName(supplierCode: string) {
  return supplierCode
    .replace(/^SUP_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeSupplierKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

async function requireUserId() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

async function findSupplierConfig(supplierName: string) {
  const rows = await db.select().from(supplierConfigs);
  const target = normalizeSupplierKey(supplierName);

  return (
    rows.find((row) => {
      const codeKey = normalizeSupplierKey(row.supplierCode);
      const formattedKey = normalizeSupplierName(row.supplierCode);
      return codeKey === target || formattedKey === target;
    }) ?? null
  );
}

function normalizeSupplierName(supplierCode: string) {
  return normalizeSupplierKey(formatSupplierName(supplierCode));
}

function resolveConfigRate(
  preferred: string | number | null | undefined,
  fallback: string | number | null | undefined,
) {
  if (preferred != null && preferred !== "") {
    return toNumber(preferred);
  }
  return toNumber(fallback);
}

export async function commitLogisticsOverride(
  supplierName: string,
  sku: string | null,
  freightPct: number,
  dutyPct: number,
): Promise<OverrideActionResult> {
  try {
    const userId = await requireUserId();
    const trimmedName = supplierName.trim();
    const internalSku = sku?.trim() || null;

    if (!trimmedName) {
      return { success: false, error: "Supplier name is required." };
    }
    if (!Number.isFinite(freightPct) || freightPct < 0) {
      return { success: false, error: "Freight percent must be a positive number." };
    }
    if (!Number.isFinite(dutyPct) || dutyPct < 0) {
      return { success: false, error: "Duty percent must be a positive number." };
    }

    const config = await findSupplierConfig(trimmedName);
    if (!config) {
      return { success: false, error: `No supplier config found for ${trimmedName}.` };
    }

    const currentFreightPct = resolveConfigRate(
      config.freightPct,
      config.freightFactorPct,
    );
    const currentDutyPct = resolveConfigRate(config.dutyPct, config.importDutyPct);
    const nextFreightPct = Number((freightPct * 100).toFixed(2));
    const nextDutyPct = Number((dutyPct * 100).toFixed(2));

    await db
      .update(supplierConfigs)
      .set({
        freightPct: toDbPct(freightPct),
        dutyPct: toDbPct(dutyPct),
        freightFactorPct: toDbPct(freightPct),
        importDutyPct: toDbPct(dutyPct),
        updatedAt: new Date(),
      })
      .where(eq(supplierConfigs.id, config.id));

    const auditRows: (typeof overrideAuditLog.$inferInsert)[] = [];

    if (!ratesMatch(currentFreightPct, nextFreightPct)) {
      auditRows.push({
        supplierName: trimmedName,
        internalSku,
        changedField: "freight",
        oldValue: currentFreightPct.toFixed(2),
        newValue: nextFreightPct.toFixed(2),
        userId,
      });
    }

    if (!ratesMatch(currentDutyPct, nextDutyPct)) {
      auditRows.push({
        supplierName: trimmedName,
        internalSku,
        changedField: "duty",
        oldValue: currentDutyPct.toFixed(2),
        newValue: nextDutyPct.toFixed(2),
        userId,
      });
    }

    if (auditRows.length > 0) {
      await db.insert(overrideAuditLog).values(auditRows);
    }

    revalidatePath("/command-center");
    return { success: true };
  } catch (error) {
    console.error("[commitLogisticsOverride]", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message === "Unauthorized"
          ? "You must be signed in to commit overrides."
          : "Failed to commit logistics override. Please try again.",
    };
  }
}

export async function toggleScarcityPremium(
  sku: string,
  isActive: boolean,
): Promise<OverrideActionResult> {
  try {
    await requireUserId();
    const internalSku = sku.trim();

    if (!internalSku) {
      return { success: false, error: "SKU is required." };
    }

    const reviewDate = isActive
      ? new Date(Date.now() + SCARCITY_REVIEW_DAYS * 24 * 60 * 60 * 1000)
      : null;

    const updated = await db
      .update(masterCatalog)
      .set({
        scarcityPremiumActive: isActive,
        scarcityReviewDate: reviewDate,
      })
      .where(eq(masterCatalog.internalSku, internalSku))
      .returning({ id: masterCatalog.id });

    if (updated.length === 0) {
      return { success: false, error: `No catalog item found for ${internalSku}.` };
    }

    revalidatePath("/command-center");
    return { success: true };
  } catch (error) {
    console.error("[toggleScarcityPremium]", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message === "Unauthorized"
          ? "You must be signed in to update scarcity."
          : "Failed to update scarcity premium. Please try again.",
    };
  }
}

export async function getLatestSkuLogisticsOverrides() {
  const rows = await db
    .select({
      supplierName: overrideAuditLog.supplierName,
      internalSku: overrideAuditLog.internalSku,
      changedField: overrideAuditLog.changedField,
      newValue: overrideAuditLog.newValue,
      createdAt: overrideAuditLog.createdAt,
    })
    .from(overrideAuditLog)
    .orderBy(desc(overrideAuditLog.createdAt));

  const latest = new Map<string, { freightPct?: number; dutyPct?: number }>();

  for (const row of rows) {
    if (!row.internalSku) {
      continue;
    }

    const key = `${row.internalSku}::${row.supplierName}`;
    const current = latest.get(key) ?? {};

    if (row.changedField === "freight" && current.freightPct == null) {
      current.freightPct = toNumber(row.newValue) / 100;
    }
    if (row.changedField === "duty" && current.dutyPct == null) {
      current.dutyPct = toNumber(row.newValue) / 100;
    }

    latest.set(key, current);
  }

  return latest;
}
