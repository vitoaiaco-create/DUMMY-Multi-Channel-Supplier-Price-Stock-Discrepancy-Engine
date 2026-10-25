import { config } from "dotenv";

config({ path: ".env" });

async function seedFx() {
  const { db } = await import("@/db");
  const { exchangeRates, supplierConfigs } = await import("@/db/schema");

  await db.delete(exchangeRates);
  await db.delete(supplierConfigs);

  await db.insert(exchangeRates).values([
    { currencyPair: "USD_ZMW", rate: "27.50" },
    { currencyPair: "EUR_ZMW", rate: "29.80" },
    { currencyPair: "ZAR_ZMW", rate: "1.55" },
  ]);

  await db.insert(supplierConfigs).values([
    {
      supplierCode: "SUP_APEX",
      baseCurrency: "USD",
      freightFactorPct: "15.00",
      importDutyPct: "15.00",
      freightPct: "15.00",
      dutyPct: "15.00",
      updatedAt: new Date(),
    },
    {
      supplierCode: "SUP_VANGUARD",
      baseCurrency: "EUR",
      freightFactorPct: "12.00",
      importDutyPct: "15.00",
      freightPct: "12.00",
      dutyPct: "15.00",
      updatedAt: new Date(),
    },
    {
      supplierCode: "SUP_DELTA",
      baseCurrency: "ZAR",
      freightFactorPct: "8.00",
      importDutyPct: "15.00",
      freightPct: "8.00",
      dutyPct: "15.00",
      updatedAt: new Date(),
    },
  ]);

  console.log("FX and Supplier configs seeded successfully");
}

seedFx().catch((error) => {
  console.error(error);
  process.exit(1);
});
