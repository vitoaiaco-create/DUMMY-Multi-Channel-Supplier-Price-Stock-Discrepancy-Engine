"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { masterCatalog } from "@/db/schema";

export type RepriceActionResult =
  | { success: true; updatedCount: number }
  | { success: false; error: string };

export type BulkRepriceUpdate = {
  internalSku: string;
  newRetailPriceUsd: number;
};

function toCatalogPrice(value: number) {
  return value.toFixed(2);
}

async function requireUserId() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

function normalizeUpdates(updates: BulkRepriceUpdate[]) {
  const unique = new Map<string, number>();

  for (const update of updates) {
    const internalSku = update.internalSku.trim();
    if (!internalSku) {
      return {
        success: false as const,
        error: "Each price update requires an internal SKU.",
      };
    }
    if (!Number.isFinite(update.newRetailPriceUsd) || update.newRetailPriceUsd <= 0) {
      return {
        success: false as const,
        error: `Retail price for ${internalSku} must be a positive number.`,
      };
    }

    unique.set(internalSku, Number(toCatalogPrice(update.newRetailPriceUsd)));
  }

  return {
    success: true as const,
    updates: [...unique.entries()].map(([internalSku, newRetailPriceUsd]) => ({
      internalSku,
      newRetailPriceUsd,
    })),
  };
}

export async function commitBulkReprice(
  updates: BulkRepriceUpdate[],
): Promise<RepriceActionResult> {
  try {
    await requireUserId();

    const normalized = normalizeUpdates(updates);
    if (!normalized.success) {
      return normalized;
    }

    let updatedCount = 0;

    for (const update of normalized.updates) {
      const updated = await db
        .update(masterCatalog)
        .set({
          retailPriceUsd: toCatalogPrice(update.newRetailPriceUsd),
        })
        .where(eq(masterCatalog.internalSku, update.internalSku))
        .returning({ internalSku: masterCatalog.internalSku });

      if (updated.length > 0) {
        updatedCount += 1;
      }
    }

    revalidatePath("/command-center");
    return { success: true, updatedCount };
  } catch (error) {
    console.error("[commitBulkReprice]", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message === "Unauthorized"
          ? "You must be signed in to commit price hikes."
          : "Failed to commit price hikes. Please try again.",
    };
  }
}
