import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import csv from "csv-parser";
import { sql } from "drizzle-orm";

config({ path: ".env" });

type CatalogCsvRow = {
  internal_sku: string;
  product_name: string;
  category: string;
  target_cost_usd: string;
  retail_price_usd: string;
  target_margin_pct: string;
  min_margin_pct: string;
  primary_supplier: string;
  current_warehouse_stock: string;
};

const BATCH_SIZE = 500;
const csvPath = resolve(process.cwd(), "data/master_internal_catalog.csv");

function parseCsv(): Promise<CatalogCsvRow[]> {
  return new Promise((resolveParse, rejectParse) => {
    const rows: CatalogCsvRow[] = [];

    createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CatalogCsvRow) => {
        rows.push(row);
      })
      .on("end", () => resolveParse(rows))
      .on("error", rejectParse);
  });
}

async function seed() {
  const { db } = await import("@/db");
  const { masterCatalog } = await import("@/db/schema");

  const csvRows = await parseCsv();

  const records = csvRows.map((row) => ({
    internalSku: row.internal_sku,
    productName: row.product_name,
    category: row.category,
    targetCostUsd: String(row.target_cost_usd),
    retailPriceUsd: String(row.retail_price_usd),
    targetMarginPct: String(row.target_margin_pct),
    minMarginPct: String(row.min_margin_pct),
    primarySupplier: row.primary_supplier,
    currentWarehouseStock: parseInt(row.current_warehouse_stock, 10),
  }));

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    await db
      .insert(masterCatalog)
      .values(batch)
      .onConflictDoUpdate({
        target: masterCatalog.internalSku,
        set: {
          productName: sql`excluded."productName"`,
          category: sql`excluded.category`,
          targetCostUsd: sql`excluded."targetCostUsd"`,
          retailPriceUsd: sql`excluded."retailPriceUsd"`,
          targetMarginPct: sql`excluded."targetMarginPct"`,
          minMarginPct: sql`excluded."minMarginPct"`,
          primarySupplier: sql`excluded."primarySupplier"`,
          currentWarehouseStock: sql`excluded."currentWarehouseStock"`,
        },
      });
    console.log(`Batch ${batchNumber} upserted...`);
  }

  console.log("Seeding complete");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
