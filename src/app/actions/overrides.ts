"use server";

import { auth } from "@clerk/nextjs/server";
import { desc, eq, inArray } from "drizzle-orm";
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

function supplierIdentityKeys(supplierName: string) {
  return new Set(
    [supplierName, formatSupplierName(supplierName)]
      .map((value) => normalizeSupplierKey(value))
      .filter(Boolean),
  );
}

function suppliersMatch(left: string, right: string) {
  const rightKeys = supplierIdentityKeys(right);
  for (const key of supplierIdentityKeys(left)) {
    if (rightKeys.has(key)) {
      return true;
    }
  }
  return false;
}

function findSupplierConfigIn(
  rows: (typeof supplierConfigs.$inferSelect)[],
  supplierName: string,
) {
  const targetKeys = supplierIdentityKeys(supplierName);
  return (
    rows.find((row) => {
      return (
        targetKeys.has(normalizeSupplierKey(row.supplierCode)) ||
        targetKeys.has(normalizeSupplierName(row.supplierCode))
      );
    }) ?? null
  );
}

function toStoredPct(value: string | number) {
  return toNumber(value).toFixed(2);
}

function resolveOldPct(
  latestValue: string | null | undefined,
  config: typeof supplierConfigs.$inferSelect | null,
  field: "freight" | "duty",
) {
  if (latestValue != null && latestValue !== "") {
    return toStoredPct(latestValue);
  }
  if (!config) {
    return "0.00";
  }

  const current =
    field === "freight"
      ? resolveConfigRate(config.freightPct, config.freightFactorPct)
      : resolveConfigRate(config.dutyPct, config.importDutyPct);

  return current.toFixed(2);
}

function latestSkuFieldValue(
  rows: SkuLogisticsOverrideRow[],
  internalSku: string,
  supplierName: string,
  changedField: "freight" | "duty",
) {
  const match = rows.find(
    (row) =>
      row.internalSku === internalSku &&
      row.changedField === changedField &&
      suppliersMatch(row.supplierName, supplierName),
  );

  return match?.newValue ?? null;
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

export type BulkLogisticsUpdate = {
  internalSku: string;
  supplierName: string;
  freightPct?: number;
  dutyPct?: number;
};

export type SkuLogisticsOverrideRow = {
  supplierName: string;
  internalSku: string | null;
  changedField: string;
  newValue: string;
  createdAt: Date | null;
};

export async function commitBulkLogistics(
  updates: BulkLogisticsUpdate[],
): Promise<OverrideActionResult> {
  try {
    const userId = await requireUserId();
    const insertData: (typeof overrideAuditLog.$inferInsert)[] = [];
    const skuList = [
      ...new Set(
        updates.map((update) => update.internalSku.trim()).filter(Boolean),
      ),
    ];

    const [existingLogs, configs] = await Promise.all([
      skuList.length === 0
        ? Promise.resolve([] as SkuLogisticsOverrideRow[])
        : db
            .select({
              supplierName: overrideAuditLog.supplierName,
              internalSku: overrideAuditLog.internalSku,
              changedField: overrideAuditLog.changedField,
              newValue: overrideAuditLog.newValue,
              createdAt: overrideAuditLog.createdAt,
            })
            .from(overrideAuditLog)
            .where(inArray(overrideAuditLog.internalSku, skuList))
            .orderBy(desc(overrideAuditLog.createdAt)),
      db.select().from(supplierConfigs),
    ]);

    for (const update of updates) {
      const internalSku = update.internalSku.trim();
      const rawSupplierName = update.supplierName.trim();
      const supplierName = formatSupplierName(rawSupplierName) || rawSupplierName;

      if (!internalSku) {
        return {
          success: false,
          error: "Each logistics update requires an internal SKU.",
        };
      }
      if (!supplierName) {
        return {
          success: false,
          error: `A supplier is required for ${internalSku}.`,
        };
      }

      const config = findSupplierConfigIn(configs, supplierName);
      const lookupName = rawSupplierName || supplierName;

      if (update.freightPct != null) {
        if (!Number.isFinite(update.freightPct) || update.freightPct < 0) {
          return {
            success: false,
            error: `Freight percent for ${internalSku} must be a positive number.`,
          };
        }

        insertData.push({
          supplierName,
          internalSku,
          changedField: "freight",
          oldValue: resolveOldPct(
            latestSkuFieldValue(existingLogs, internalSku, lookupName, "freight"),
            config,
            "freight",
          ),
          newValue: toStoredPct(update.freightPct),
          userId,
        });
      }

      if (update.dutyPct != null) {
        if (!Number.isFinite(update.dutyPct) || update.dutyPct < 0) {
          return {
            success: false,
            error: `Duty percent for ${internalSku} must be a positive number.`,
          };
        }

        insertData.push({
          supplierName,
          internalSku,
          changedField: "duty",
          oldValue: resolveOldPct(
            latestSkuFieldValue(existingLogs, internalSku, lookupName, "duty"),
            config,
            "duty",
          ),
          newValue: toStoredPct(update.dutyPct),
          userId,
        });
      }
    }

    if (insertData.length === 0) {
      return {
        success: false,
        error: "Enter a freight or duty override before committing.",
      };
    }

    await db.insert(overrideAuditLog).values(insertData);
    revalidatePath("/command-center");
    return { success: true };
  } catch (error) {
    console.error("[commitBulkLogistics]", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message === "Unauthorized"
          ? "You must be signed in to commit overrides."
          : "Failed to commit bulk logistics overrides. Please try again.",
    };
  }
}

export async function getLatestSkuLogisticsOverrides(): Promise<
  SkuLogisticsOverrideRow[]
> {
  return db
    .select({
      supplierName: overrideAuditLog.supplierName,
      internalSku: overrideAuditLog.internalSku,
      changedField: overrideAuditLog.changedField,
      newValue: overrideAuditLog.newValue,
      createdAt: overrideAuditLog.createdAt,
    })
    .from(overrideAuditLog)
    .orderBy(desc(overrideAuditLog.createdAt));
}
