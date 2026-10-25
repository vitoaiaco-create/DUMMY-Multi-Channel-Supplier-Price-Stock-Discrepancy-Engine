"use server";

import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import csv from "csv-parser";

import { db } from "@/db";
import {
  exchangeRates,
  marginAlerts,
  masterCatalog,
  supplierConfigs,
} from "@/db/schema";

const APEX_SUPPLIER_CODE = "SUP_APEX";
const USD_ZMW_PAIR = "USD_ZMW";
const BATCH_SIZE = 500;
const APEX_FEED_PATH = resolve(process.cwd(), "data/supplier_apex_feed.csv");

type ApexFeedRow = {
  Vendor_Part_Number: string;
  Item_Description: string;
  Wholesale_Cost_USD: string;
  Qty_Available: string;
  Standard_Lead_Days: string;
};

type CatalogRow = typeof masterCatalog.$inferSelect;
type SupplierConfigRow = typeof supplierConfigs.$inferSelect;
type ExchangeRateRow = typeof exchangeRates.$inferSelect;
type MarginAlertInsert = typeof marginAlerts.$inferInsert;

function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (value == null || value === "") return Number.NaN;
  return Number(value);
}

function toFixedString(value: number, scale: number): string {
  return value.toFixed(scale);
}

function parseApexFeedAlerts(
  catalogBySku: Map<string, CatalogRow>,
  freightFactorPct: number,
  importDutyPct: number,
  exchangeRate: number,
): Promise<MarginAlertInsert[]> {
  return new Promise((resolveParse, rejectParse) => {
    const alerts: MarginAlertInsert[] = [];

    createReadStream(APEX_FEED_PATH)
      .pipe(csv())
      .on("data", (row: ApexFeedRow) => {
        const catalogItem = catalogBySku.get(row.Vendor_Part_Number);
        if (!catalogItem) return;

        const fobCostUsd = parseNumber(row.Wholesale_Cost_USD);
        const retailPriceUsd = parseNumber(catalogItem.retailPriceUsd);
        const minMarginPct = parseNumber(catalogItem.minMarginPct);

        if (
          !Number.isFinite(fobCostUsd) ||
          !Number.isFinite(retailPriceUsd) ||
          !Number.isFinite(minMarginPct) ||
          retailPriceUsd === 0
        ) {
          return;
        }

        const cifCost = fobCostUsd * (1 + freightFactorPct / 100);
        const landedUsd = cifCost * (1 + importDutyPct / 100);
        const trueLandedCostZmw = landedUsd * exchangeRate;
        const retailPriceZmw = retailPriceUsd * exchangeRate;
        const newMarginPct =
          ((retailPriceZmw - trueLandedCostZmw) / retailPriceZmw) * 100;

        if (newMarginPct < minMarginPct) {
          alerts.push({
            internalSku: catalogItem.internalSku,
            supplierCode: APEX_SUPPLIER_CODE,
            vendorRawSku: row.Vendor_Part_Number,
            supplierFobCostUsd: toFixedString(fobCostUsd, 2),
            trueLandedCostZmw: toFixedString(trueLandedCostZmw, 2),
            retailPriceZmw: toFixedString(retailPriceZmw, 2),
            newMarginPct: toFixedString(newMarginPct, 2),
            fxRateUsed: toFixedString(exchangeRate, 4),
          });
        }
      })
      .on("end", () => resolveParse(alerts))
      .on("error", rejectParse);
  });
}

export async function runTlcMarginAnalysis() {
  const [catalogRows, configRows, rateRows] = await Promise.all([
    db.select().from(masterCatalog),
    db.select().from(supplierConfigs),
    db.select().from(exchangeRates),
  ]);

  const catalogBySku = new Map(
    catalogRows.map((row) => [row.internalSku, row]),
  );
  const configsBySupplier = new Map(
    configRows.map((row) => [row.supplierCode, row]),
  );
  const ratesByPair = new Map(rateRows.map((row) => [row.currencyPair, row]));

  const apexConfig: SupplierConfigRow | undefined =
    configsBySupplier.get(APEX_SUPPLIER_CODE);
  const usdZmwRate: ExchangeRateRow | undefined =
    ratesByPair.get(USD_ZMW_PAIR);

  if (!apexConfig) {
    throw new Error(`Missing supplier config for ${APEX_SUPPLIER_CODE}`);
  }
  if (!usdZmwRate) {
    throw new Error(`Missing exchange rate for ${USD_ZMW_PAIR}`);
  }

  const freightFactorPct = parseNumber(apexConfig.freightFactorPct);
  const importDutyPct = parseNumber(apexConfig.importDutyPct);
  const exchangeRate = parseNumber(usdZmwRate.rate);

  if (
    !Number.isFinite(freightFactorPct) ||
    !Number.isFinite(importDutyPct) ||
    !Number.isFinite(exchangeRate)
  ) {
    throw new Error("Invalid numeric freight, duty, or exchange rate values");
  }

  const alerts = await parseApexFeedAlerts(
    catalogBySku,
    freightFactorPct,
    importDutyPct,
    exchangeRate,
  );

  await db.delete(marginAlerts);

  for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
    const batch = alerts.slice(i, i + BATCH_SIZE);
    await db.insert(marginAlerts).values(batch);
  }

  return { success: true as const, alertsGenerated: alerts.length };
}
