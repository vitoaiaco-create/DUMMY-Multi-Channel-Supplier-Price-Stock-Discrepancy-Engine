"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { marginAlerts, masterCatalog } from "@/db/schema";

export type MarginAlert = {
  id: string;
  sku: string;
  productName: string;
  supplier: string;
  fobCostUsd: number;
  trueLandedCostZmw: number;
  retailPriceZmw: number;
  newMarginPct: number;
  fxRateUsed: number;
};

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

export async function getAlerts(): Promise<MarginAlert[]> {
  const rows = await db
    .select({
      id: marginAlerts.id,
      sku: marginAlerts.internalSku,
      productName: masterCatalog.productName,
      supplier: marginAlerts.supplierCode,
      fobCostUsd: marginAlerts.supplierFobCostUsd,
      trueLandedCostZmw: marginAlerts.trueLandedCostZmw,
      retailPriceZmw: marginAlerts.retailPriceZmw,
      newMarginPct: marginAlerts.newMarginPct,
      fxRateUsed: marginAlerts.fxRateUsed,
    })
    .from(marginAlerts)
    .leftJoin(
      masterCatalog,
      eq(marginAlerts.internalSku, masterCatalog.internalSku),
    );

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    productName: row.productName ?? "Unmapped SKU",
    supplier: row.supplier,
    fobCostUsd: toNumber(row.fobCostUsd),
    trueLandedCostZmw: toNumber(row.trueLandedCostZmw),
    retailPriceZmw: toNumber(row.retailPriceZmw),
    newMarginPct: toNumber(row.newMarginPct),
    fxRateUsed: toNumber(row.fxRateUsed),
  }));
}
