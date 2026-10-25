import { integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});

export const masterCatalog = pgTable("master_catalog", {
  id: uuid().primaryKey().defaultRandom(),
  internalSku: text().unique().notNull(),
  productName: text().notNull(),
  category: text(),
  benchmarkCost: numeric({ precision: 10, scale: 2 }).notNull(),
  retailPrice: numeric({ precision: 10, scale: 2 }).notNull(),
  minMarginPct: numeric({ precision: 5, scale: 2 }).notNull(),
  currentStock: integer().default(0),
});

export const supplierFeeds = pgTable("supplier_feeds", {
  id: uuid().primaryKey().defaultRandom(),
  supplierCode: text().notNull(),
  vendorSku: text().notNull(),
  wholesaleCost: numeric({ precision: 10, scale: 2 }).notNull(),
  stockQty: integer().notNull(),
  ingestedAt: timestamp().defaultNow(),
});

export const marginAlerts = pgTable("margin_alerts", {
  id: uuid().primaryKey().defaultRandom(),
  internalSku: text().notNull(),
  supplierCode: text().notNull(),
  vendorRawSku: text().notNull(),
  supplierFobCostUsd: numeric({ precision: 10, scale: 2 }),
  trueLandedCostZmw: numeric({ precision: 10, scale: 2 }),
  retailPriceZmw: numeric({ precision: 10, scale: 2 }),
  newMarginPct: numeric({ precision: 5, scale: 2 }),
  fxRateUsed: numeric({ precision: 10, scale: 4 }),
  status: text().default("PENDING_REVIEW"),
  detectedAt: timestamp().defaultNow(),
});

export const supplierConfigs = pgTable("supplier_configs", {
  id: uuid().primaryKey().defaultRandom(),
  supplierCode: text().unique().notNull(),
  baseCurrency: text().notNull(),
  freightFactorPct: numeric({ precision: 5, scale: 2 }).notNull(),
  importDutyPct: numeric({ precision: 5, scale: 2 }).notNull(),
  updatedAt: timestamp(),
});

export const supplierMappingTemplates = pgTable("supplier_mapping_templates", {
  id: uuid().primaryKey().defaultRandom(),
  supplierName: text().unique().notNull(),
  mappings: jsonb().notNull(),
  updatedAt: timestamp().defaultNow(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid().primaryKey().defaultRandom(),
  currencyPair: text().unique().notNull(),
  rate: numeric({ precision: 10, scale: 4 }).notNull(),
  lastUpdated: timestamp().defaultNow(),
});
