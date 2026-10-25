"use server";

import { asc, eq } from "drizzle-orm";

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
  fobPriceUsd: number;
  freightPct: number;
  dutyPct: number;
};

export type CommandCenterSku = {
  internalSku: string;
  productName: string;
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
  const rows = await db
    .select({
      internalSku: masterCatalog.internalSku,
      productName: masterCatalog.productName,
      supplierCode: marginAlerts.supplierCode,
      fobPriceUsd: marginAlerts.supplierFobCostUsd,
      freightPct: supplierConfigs.freightFactorPct,
      dutyPct: supplierConfigs.importDutyPct,
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
    .orderBy(asc(masterCatalog.internalSku));

  const grouped = new Map<string, CommandCenterSku>();

  for (const row of rows) {
    if (row.fobPriceUsd == null) {
      continue;
    }

    const supplier: CommandCenterSupplier = {
      supplierName: formatSupplierName(row.supplierCode),
      fobPriceUsd: toNumber(row.fobPriceUsd),
      freightPct: toRateDecimal(row.freightPct),
      dutyPct: toRateDecimal(row.dutyPct),
    };

    const existing = grouped.get(row.internalSku);
    if (existing) {
      existing.suppliers.push(supplier);
      continue;
    }

    grouped.set(row.internalSku, {
      internalSku: row.internalSku,
      productName: row.productName,
      suppliers: [supplier],
    });
  }

  return Array.from(grouped.values());
}
