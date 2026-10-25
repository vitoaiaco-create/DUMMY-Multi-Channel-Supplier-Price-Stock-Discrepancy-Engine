"use server";

import { asc, eq } from "drizzle-orm";

import { getLatestSkuLogisticsOverrides } from "@/app/actions/overrides";
import { db } from "@/db";
import { marginAlerts, masterCatalog, supplierConfigs } from "@/db/schema";

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

export type CommandCenterSupplier = {
  supplierName: string;
  supplierCode: string;
  fobPriceUsd: number;
  freightPct: number;
  dutyPct: number;
};

export type CommandCenterSku = {
  internalSku: string;
  productName: string;
  category: string | null;
  targetCostUsd: number;
  retailPriceUsd: number;
  targetMarginPct: number;
  minMarginPct: number;
  primarySupplier: string | null;
  currentWarehouseStock: number;
  scarcityPremiumActive: boolean;
  scarcityReviewDate: string | null;
  suppliers: CommandCenterSupplier[];
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

function formatSupplierName(supplierCode: string) {
  return supplierCode
    .replace(/^SUP_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toRateDecimal(value: string | number | null | undefined): number {
  return toNumber(value) / 100;
}

export async function getCommandCenterData(): Promise<CommandCenterSku[]> {
  const [rows, skuOverrides] = await Promise.all([
    db
      .select({
        internalSku: masterCatalog.internalSku,
        productName: masterCatalog.productName,
        category: masterCatalog.category,
        targetCostUsd: masterCatalog.targetCostUsd,
        retailPriceUsd: masterCatalog.retailPriceUsd,
        targetMarginPct: masterCatalog.targetMarginPct,
        minMarginPct: masterCatalog.minMarginPct,
        primarySupplier: masterCatalog.primarySupplier,
        currentWarehouseStock: masterCatalog.currentWarehouseStock,
        scarcityPremiumActive: masterCatalog.scarcityPremiumActive,
        scarcityReviewDate: masterCatalog.scarcityReviewDate,
        supplierCode: marginAlerts.supplierCode,
        fobPriceUsd: marginAlerts.supplierFobCostUsd,
        freightPct: supplierConfigs.freightPct,
        dutyPct: supplierConfigs.dutyPct,
        freightFactorPct: supplierConfigs.freightFactorPct,
        importDutyPct: supplierConfigs.importDutyPct,
      })
      .from(masterCatalog)
      .innerJoin(
        marginAlerts,
        eq(masterCatalog.internalSku, marginAlerts.internalSku),
      )
      .leftJoin(
        supplierConfigs,
        eq(marginAlerts.supplierCode, supplierConfigs.supplierCode),
      )
      .orderBy(asc(masterCatalog.internalSku)),
    getLatestSkuLogisticsOverrides(),
  ]);

  const grouped = new Map<string, CommandCenterSku>();

  for (const row of rows) {
    if (row.fobPriceUsd == null) {
      continue;
    }

    const supplierName = formatSupplierName(row.supplierCode);
    const committed = skuOverrides.get(`${row.internalSku}::${supplierName}`);
    const supplier: CommandCenterSupplier = {
      supplierName,
      supplierCode: row.supplierCode,
      fobPriceUsd: toNumber(row.fobPriceUsd),
      freightPct:
        committed?.freightPct ??
        toRateDecimal(row.freightPct ?? row.freightFactorPct),
      dutyPct:
        committed?.dutyPct ?? toRateDecimal(row.dutyPct ?? row.importDutyPct),
    };

    const existing = grouped.get(row.internalSku);
    if (existing) {
      existing.suppliers.push(supplier);
      continue;
    }

    grouped.set(row.internalSku, {
      internalSku: row.internalSku,
      productName: row.productName,
      category: row.category,
      targetCostUsd: toNumber(row.targetCostUsd),
      retailPriceUsd: toNumber(row.retailPriceUsd),
      targetMarginPct: toNumber(row.targetMarginPct),
      minMarginPct: toNumber(row.minMarginPct),
      primarySupplier: row.primarySupplier,
      currentWarehouseStock: row.currentWarehouseStock ?? 0,
      scarcityPremiumActive: Boolean(row.scarcityPremiumActive),
      scarcityReviewDate: row.scarcityReviewDate
        ? row.scarcityReviewDate.toISOString()
        : null,
      suppliers: [supplier],
    });
  }

  return Array.from(grouped.values());
}
