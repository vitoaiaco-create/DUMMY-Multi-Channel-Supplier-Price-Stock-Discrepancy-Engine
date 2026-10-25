"use client";

import { CircleDollarSign, FileDown } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import {
  commitLogisticsOverride,
  toggleScarcityPremium,
} from "@/app/actions/overrides";
import { commitBulkReprice } from "@/app/actions/reprice";
import { MarginGrid } from "@/components/command-center/margin-grid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatFx,
  getMarginHealthStatus,
  isBelowMinMargin,
  overrideKey,
  priceCommandCenterSku,
  ratesMatch,
  requiredRetailUsdForMinMargin,
  type CurrencyMode,
  type LogisticsOverride,
  type MarginHealthStatus,
  type PricedSku,
  type SupplierOffer,
  type SupplierTlc,
} from "@/lib/command-center-pricing";

const DEFAULT_FX = 27.5;
const MIN_FX = 20;
const MAX_FX = 35;
const FX_STEP = 0.1;

const MASTER_EXPORT_HEADERS = [
  "internal_sku",
  "product_name",
  "category",
  "target_cost_usd",
  "retail_price_usd",
  "target_margin_pct",
  "min_margin_pct",
  "primary_supplier",
  "current_warehouse_stock",
] as const;

const MARGIN_HEALTH_ITEMS = [
  { label: "All", value: "all" },
  { label: "Below Min", value: "red" },
  { label: "Below Target", value: "amber" },
  { label: "On Target", value: "green" },
] as const;

type MarginHealthFilter = (typeof MARGIN_HEALTH_ITEMS)[number]["value"];

function isMarginHealthFilter(value: unknown): value is MarginHealthFilter {
  return (
    typeof value === "string" &&
    MARGIN_HEALTH_ITEMS.some((item) => item.value === value)
  );
}

function isCurrencyMode(value: unknown): value is CurrencyMode {
  return value === "USD" || value === "ZMW";
}

function matchesMarginHealth(row: PricedSku, filter: MarginHealthFilter) {
  if (filter === "all") {
    return true;
  }

  return (
    getMarginHealthStatus(
      row.currentMarginPct,
      row.minMarginPct,
      row.targetMarginPct,
    ) === (filter as MarginHealthStatus)
  );
}

function toExportNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function toMasterExportRow(row: PricedSku) {
  return {
    internal_sku: row.internalSku,
    product_name: row.productName,
    category: row.category ?? "",
    target_cost_usd: toExportNumber(row.bestTlcUsd),
    retail_price_usd: toExportNumber(row.retailPriceUsd),
    target_margin_pct: toExportNumber(row.targetMarginPct, 1),
    min_margin_pct: toExportNumber(row.minMarginPct, 1),
    primary_supplier: row.primarySupplier ?? "",
    current_warehouse_stock: row.currentWarehouseStock,
  };
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportMasterPriceList(rows: PricedSku[], currentFxRate: number) {
  const exportRows = rows.map(toMasterExportRow);
  const stamp = formatFx(currentFxRate);
  const csv = Papa.unparse(exportRows, {
    columns: [...MASTER_EXPORT_HEADERS],
  });
  downloadCsv(`lua-lua-master-price-list-${stamp}.csv`, csv);

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const generatedAt = new Date().toLocaleString("en-ZM");

  doc.setFontSize(16);
  doc.text("Lua Lua Master Price List", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Live FX ${formatFx(currentFxRate)} USD/ZMW · ${generatedAt}`, 14, 25);
  doc.text(
    "target_cost_usd is the live Best TLC (USD) for ERP benchmark updates.",
    14,
    31,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 36,
    head: [[...MASTER_EXPORT_HEADERS]],
    body: exportRows.map((row) =>
      MASTER_EXPORT_HEADERS.map((header) => String(row[header])),
    ),
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 28, font: "courier" },
      1: { cellWidth: 52 },
      2: { cellWidth: 24 },
      3: { cellWidth: 24, halign: "right", font: "courier" },
      4: { cellWidth: 24, halign: "right", font: "courier" },
      5: { cellWidth: 24, halign: "right", font: "courier" },
      6: { cellWidth: 22, halign: "right", font: "courier" },
      7: { cellWidth: 32, font: "courier" },
      8: { cellWidth: 28, halign: "right", font: "courier" },
    },
  });

  doc.save(`lua-lua-master-price-list-${stamp}.pdf`);
}

export function CommandCenterClient({
  initialData,
}: {
  initialData: CommandCenterSku[];
}) {
  const router = useRouter();
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("ZMW");
  const [marginHealth, setMarginHealth] = useState<MarginHealthFilter>("all");
  const [skuData, setSkuData] = useState(initialData);
  const [overrides, setOverrides] = useState<Record<string, LogisticsOverride>>(
    {},
  );
  const [stagedPriceUpdates, setStagedPriceUpdates] = useState<
    Record<string, number>
  >({});
  const [committingKey, setCommittingKey] = useState<string | null>(null);
  const [scarcityPendingSku, setScarcityPendingSku] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isCommittingReprice, setIsCommittingReprice] = useState(false);

  useEffect(() => {
    setSkuData(initialData);
  }, [initialData]);

  const pricedRows = useMemo(
    () => skuData.map((sku) => priceCommandCenterSku(sku, fxRate, overrides)),
    [fxRate, overrides, skuData],
  );

  const filteredData = useMemo(() => {
    if (marginHealth === "all") {
      return pricedRows;
    }

    return pricedRows.filter((sku) => matchesMarginHealth(sku, marginHealth));
  }, [marginHealth, pricedRows]);

  const underperformingInView = useMemo(
    () => filteredData.filter(isBelowMinMargin),
    [filteredData],
  );

  const stagedCount = Object.keys(stagedPriceUpdates).length;

  function updateOverride(
    internalSku: string,
    supplier: SupplierOffer,
    field: keyof LogisticsOverride,
    nextDisplayPct: number,
  ) {
    const key = overrideKey(internalSku, supplier.supplierName);
    const current = overrides[key];
    const nextFreightPct =
      field === "freightPct"
        ? nextDisplayPct / 100
        : (current?.freightPct ?? supplier.freightPct);
    const nextDutyPct =
      field === "dutyPct"
        ? nextDisplayPct / 100
        : (current?.dutyPct ?? supplier.dutyPct);

    setOverrides((existing) => {
      const next = { ...existing };
      if (
        ratesMatch(nextFreightPct, supplier.freightPct) &&
        ratesMatch(nextDutyPct, supplier.dutyPct)
      ) {
        delete next[key];
      } else {
        next[key] = {
          freightPct: nextFreightPct,
          dutyPct: nextDutyPct,
        };
      }
      return next;
    });
  }

  async function handleCommitOverride(group: PricedSku, supplier: SupplierTlc) {
    const key = overrideKey(group.internalSku, supplier.supplierName);
    setActionError(null);
    setCommittingKey(key);

    const result = await commitLogisticsOverride(
      supplier.supplierName,
      group.internalSku,
      supplier.effectiveFreightPct,
      supplier.effectiveDutyPct,
    );

    if (!result.success) {
      setActionError(result.error);
      setCommittingKey(null);
      return;
    }

    setSkuData((current) =>
      current.map((sku) =>
        sku.internalSku === group.internalSku
          ? {
              ...sku,
              suppliers: sku.suppliers.map((offer) =>
                offer.supplierName === supplier.supplierName
                  ? {
                      ...offer,
                      freightPct: supplier.effectiveFreightPct,
                      dutyPct: supplier.effectiveDutyPct,
                    }
                  : offer,
              ),
            }
          : sku,
      ),
    );
    setOverrides((existing) => {
      const next = { ...existing };
      delete next[key];
      return next;
    });
    setCommittingKey(null);
  }

  async function handleToggleScarcity(sku: CommandCenterSku, isActive: boolean) {
    const previous = sku.scarcityPremiumActive;
    const previousReviewDate = sku.scarcityReviewDate;
    setActionError(null);
    setScarcityPendingSku(sku.internalSku);
    setSkuData((current) =>
      current.map((row) =>
        row.internalSku === sku.internalSku
          ? {
              ...row,
              scarcityPremiumActive: isActive,
              scarcityReviewDate: isActive
                ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                : null,
            }
          : row,
      ),
    );

    const result = await toggleScarcityPremium(sku.internalSku, isActive);
    if (!result.success) {
      setActionError(result.error);
      setSkuData((current) =>
        current.map((row) =>
          row.internalSku === sku.internalSku
            ? {
                ...row,
                scarcityPremiumActive: previous,
                scarcityReviewDate: previousReviewDate,
              }
            : row,
        ),
      );
    }
    setScarcityPendingSku(null);
  }

  async function handleExport() {
    setActionError(null);
    setIsExporting(true);
    try {
      await exportMasterPriceList(filteredData, fxRate);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to export the master price list.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleRepriceToMinimum() {
    const next: Record<string, number> = {};

    for (const row of underperformingInView) {
      const requiredUsd = requiredRetailUsdForMinMargin(
        row.bestTlc,
        row.minMarginPct,
        fxRate,
      );
      if (requiredUsd == null) {
        continue;
      }
      next[row.internalSku] = requiredUsd;
    }

    setStagedPriceUpdates(next);
  }

  async function handleCommitPriceHikes() {
    const updates = Object.entries(stagedPriceUpdates).map(
      ([internalSku, newRetailPriceUsd]) => ({
        internalSku,
        newRetailPriceUsd,
      }),
    );
    if (updates.length === 0) {
      return;
    }

    setActionError(null);
    setIsCommittingReprice(true);

    try {
      const result = await commitBulkReprice(updates);
      if (!result.success) {
        setActionError(result.error);
        return;
      }

      setSkuData((current) =>
        current.map((sku) => {
          const nextPrice = stagedPriceUpdates[sku.internalSku];
          return nextPrice == null
            ? sku
            : { ...sku, retailPriceUsd: nextPrice };
        }),
      );
      setStagedPriceUpdates({});
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to commit price hikes. Please try again.",
      );
    } finally {
      setIsCommittingReprice(false);
    }
  }

  return (
    <section className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          TLC Margin Command Center
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Monitor True Landed Cost against live FX, flag margin risk, and stress
          retail prices before they hit the floor.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>FX stress control</CardTitle>
          <CardDescription>
            Drag the USD/ZMW rate to recalculate True Landed Cost and the best
            supplier for every SKU.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-(--card-spacing)">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="fx-rate-slider">USD / ZMW</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatFx(MIN_FX)} — {formatFx(MAX_FX)}
                </span>
              </div>
              <Slider
                id="fx-rate-slider"
                min={MIN_FX}
                max={MAX_FX}
                step={FX_STEP}
                value={[fxRate]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  if (typeof next === "number") {
                    setFxRate(next);
                  }
                }}
                aria-label="USD to ZMW exchange rate"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="shrink-0 rounded-xl bg-muted/60 px-5 py-3 text-right sm:min-w-40">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Live FX rate
                </p>
                <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
                  {formatFx(fxRate)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency-view">Currency View</Label>
                <Tabs
                  value={currencyMode}
                  onValueChange={(value) => {
                    if (isCurrencyMode(value)) {
                      setCurrencyMode(value);
                    }
                  }}
                >
                  <TabsList id="currency-view" aria-label="Currency view">
                    <TabsTrigger value="ZMW">ZMW</TabsTrigger>
                    <TabsTrigger value="USD">USD</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <Label htmlFor="margin-health-filter">Margin Health</Label>
                <Select
                  items={[...MARGIN_HEALTH_ITEMS]}
                  value={marginHealth}
                  onValueChange={(value) => {
                    if (isMarginHealthFilter(value)) {
                      setMarginHealth(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id="margin-health-filter"
                    className="min-w-52"
                    aria-label="Filter SKUs by margin health"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARGIN_HEALTH_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                disabled={
                  isExporting ||
                  isCommittingReprice ||
                  underperformingInView.length === 0
                }
                onClick={handleRepriceToMinimum}
              >
                Reprice to Minimum
              </Button>
              {stagedCount > 0 ? (
                <Button
                  disabled={isCommittingReprice}
                  onClick={() => {
                    void handleCommitPriceHikes();
                  }}
                >
                  <CircleDollarSign data-icon="inline-start" />
                  {isCommittingReprice
                    ? "Committing..."
                    : `Commit Price Hikes (${stagedCount})`}
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={isExporting || filteredData.length === 0}
                onClick={() => {
                  void handleExport();
                }}
              >
                <FileDown data-icon="inline-start" />
                {isExporting ? "Exporting..." : "Export Master Price List"}
              </Button>
            </div>
          </div>
          {actionError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>SKU cross-analysis</CardTitle>
          <CardDescription>
            Expand a SKU to compare supplier True Landed Cost at the current FX
            rate. Hover a TLC value for the freight and duty breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <MarginGrid
            committingKey={committingKey}
            currencyMode={currencyMode}
            currentFxRate={fxRate}
            rows={filteredData}
            scarcityPendingSku={scarcityPendingSku}
            stagedPriceUpdates={stagedPriceUpdates}
            onCommitOverride={handleCommitOverride}
            onLogisticsChange={updateOverride}
            onToggleScarcity={handleToggleScarcity}
          />
        </CardContent>
      </Card>
    </section>
  );
}
