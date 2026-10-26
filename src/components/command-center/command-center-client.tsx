"use client";

import { CircleDollarSign, FileDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import {
  commitBulkLogistics,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  COMMAND_CENTER_FILTER_KEYS,
  parseCurrencyMode,
  parseMarginHealth,
  type MarginHealthFilter,
} from "@/lib/command-center-filters";
import {
  formatFx,
  formatUsd,
  getMarginHealthStatus,
  isBelowMinMargin,
  overrideKey,
  priceCommandCenterSku,
  ratesMatch,
  requiredRetailUsdForMinMargin,
  type LogisticsOverride,
  type MarginHealthStatus,
  type PricedSku,
  type SupplierOffer,
  type SupplierTlc,
} from "@/lib/command-center-pricing";

const DEFAULT_FX = 27.5;
const DEFAULT_CATALOG_FX = 25.5;
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

function matchesSkuSearch(group: PricedSku, skuSearch: string) {
  if (skuSearch.trim() === "") {
    return true;
  }

  return group.internalSku.toLowerCase().includes(skuSearch.trim().toLowerCase());
}

function matchesNameSearch(group: PricedSku, nameSearch: string) {
  if (nameSearch === "") {
    return true;
  }

  return group.productName.toLowerCase().includes(nameSearch.toLowerCase());
}

function bulkSupplierNames(row: PricedSku | CommandCenterSku | undefined) {
  if (!row) {
    return [];
  }

  const offerNames = [
    ...new Set(
      row.suppliers
        .map((supplier) => supplier.supplierName.trim())
        .filter(Boolean),
    ),
  ];
  if (offerNames.length > 0) {
    return offerNames;
  }

  return row.primarySupplier?.trim() ? [row.primarySupplier.trim()] : [];
}

function matchesSupplierSearch(group: PricedSku, supplierSearch: string) {
  const query = supplierSearch.trim().toLowerCase();
  if (query === "") {
    return true;
  }

  if (group.primarySupplier?.toLowerCase().includes(query)) {
    return true;
  }

  return group.suppliers.some((supplier) =>
    supplier.supplierName.toLowerCase().includes(query),
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

const AUDIT_REPORT_HEADERS = [
  "Internal SKU",
  "Product Name",
  "Primary Supplier",
  "Current Margin %",
  "Current Warehouse Stock",
  "Target Cost (USD)",
  "Capital Exposure (USD)",
] as const;

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

function downloadAuditReport(failingSkus: PricedSku[]) {
  const csvContent = Papa.unparse(
    failingSkus.map((row) => {
      const unitCost = row.targetCostUsd;
      const stock = row.currentWarehouseStock;
      const capitalExposure =
        Number.isFinite(unitCost) && Number.isFinite(stock)
          ? unitCost * stock
          : Number.NaN;

      return {
        "Internal SKU": row.internalSku,
        "Product Name": row.productName,
        "Primary Supplier": row.primarySupplier ?? "",
        "Current Margin %": toExportNumber(
          row.currentMarginPct ?? Number.NaN,
          1,
        ),
        "Current Warehouse Stock": stock,
        "Target Cost (USD)": toExportNumber(unitCost),
        "Capital Exposure (USD)": toExportNumber(capitalExposure),
      };
    }),
    {
      columns: [...AUDIT_REPORT_HEADERS],
    },
  );

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Failing_SKUs_Audit_Report.csv";
  link.style.display = "none";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skuSearch = searchParams.get(COMMAND_CENTER_FILTER_KEYS.sku) ?? "";
  const nameSearch = searchParams.get(COMMAND_CENTER_FILTER_KEYS.name) ?? "";
  const supplierSearch =
    searchParams.get(COMMAND_CENTER_FILTER_KEYS.supplier) ?? "";
  const marginHealth = parseMarginHealth(
    searchParams.get(COMMAND_CENTER_FILTER_KEYS.margin),
  );
  const currencyMode = parseCurrencyMode(
    searchParams.get(COMMAND_CENTER_FILTER_KEYS.currency),
  );
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const deferredFxRate = useDeferredValue(fxRate);
  const [catalogFxRate, setCatalogFxRate] = useState(DEFAULT_CATALOG_FX);
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
  const [isCommittingLogistics, setIsCommittingLogistics] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [flatFreightOverride, setFlatFreightOverride] = useState("");
  const [flatDutyOverride, setFlatDutyOverride] = useState("");

  useEffect(() => {
    setSkuData(initialData);
  }, [initialData]);

  const pricedRows = useMemo(
    () =>
      skuData.map((sku) =>
        priceCommandCenterSku(sku, deferredFxRate, overrides, catalogFxRate),
      ),
    [catalogFxRate, deferredFxRate, overrides, skuData],
  );

  const filteredData = useMemo(
    () =>
      pricedRows.filter(
        (group) =>
          matchesMarginHealth(group, marginHealth) &&
          matchesSkuSearch(group, skuSearch) &&
          matchesNameSearch(group, nameSearch) &&
          matchesSupplierSearch(group, supplierSearch),
      ),
    [marginHealth, nameSearch, pricedRows, skuSearch, supplierSearch],
  );

  const failingSkus = useMemo(
    () => filteredData.filter(isBelowMinMargin),
    [filteredData],
  );

  const capitalAtRiskUsd = useMemo(
    () =>
      failingSkus.reduce((sum, row) => {
        const unitCost = row.targetCostUsd;
        const stock = row.currentWarehouseStock;
        if (!Number.isFinite(unitCost) || !Number.isFinite(stock)) {
          return sum;
        }
        return sum + unitCost * stock;
      }, 0),
    [failingSkus],
  );

  const stagedCount = Object.keys(stagedPriceUpdates).length;

  function isolateFailingSkus() {
    const params = new URLSearchParams(searchParams.toString());
    params.set(COMMAND_CENTER_FILTER_KEYS.margin, "red");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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

  function handleStagePreemptiveReprice() {
    const next: Record<string, number> = {};

    for (const row of failingSkus) {
      const bestTlcZmw = row.bestTlcUsd * fxRate;
      const requiredUsd = requiredRetailUsdForMinMargin(
        bestTlcZmw,
        row.minMarginPct,
        catalogFxRate,
      );
      if (requiredUsd == null) {
        continue;
      }
      next[row.internalSku] = requiredUsd;
    }

    setStagedPriceUpdates(next);
  }

  function toggleSkuSelection(internalSku: string) {
    setSelectedSkus((current) =>
      current.includes(internalSku)
        ? current.filter((sku) => sku !== internalSku)
        : [...current, internalSku],
    );
  }

  function selectAllVisibleSkus(selected: boolean) {
    const visibleSkus = filteredData.map((row) => row.internalSku);
    setSelectedSkus((current) => {
      const next = new Set(current);
      if (selected) {
        for (const sku of visibleSkus) {
          next.add(sku);
        }
      } else {
        for (const sku of visibleSkus) {
          next.delete(sku);
        }
      }
      return Array.from(next);
    });
  }

  async function handleCommitLogistics() {
    const parsedFreight =
      flatFreightOverride.trim() === ""
        ? undefined
        : Number(flatFreightOverride);
    const parsedDuty =
      flatDutyOverride.trim() === "" ? undefined : Number(flatDutyOverride);

    if (
      (parsedFreight == null || !Number.isFinite(parsedFreight)) &&
      (parsedDuty == null || !Number.isFinite(parsedDuty))
    ) {
      setActionError("Enter a freight or duty override before committing.");
      return;
    }

    const payload = selectedSkus.flatMap((sku) => {
      const row =
        filteredData.find((item) => item.internalSku === sku) ??
        skuData.find((item) => item.internalSku === sku);

      return bulkSupplierNames(row).map((supplierName) => ({
        internalSku: sku,
        supplierName,
        freightPct: parsedFreight,
        dutyPct: parsedDuty,
      }));
    });

    if (payload.length === 0) {
      setActionError("Selected SKUs are missing a supplier to override.");
      return;
    }

    setActionError(null);
    setIsCommittingLogistics(true);

    try {
      const result = await commitBulkLogistics(payload);
      if (!result.success) {
        setActionError(result.error);
        return;
      }

      setSelectedSkus([]);
      setFlatFreightOverride("");
      setFlatDutyOverride("");
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to commit logistics overrides. Please try again.",
      );
    } finally {
      setIsCommittingLogistics(false);
    }
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
          <CardTitle>Macro Stress Dashboard</CardTitle>
          <CardDescription>
            Hold catalog retail at the baseline FX while the stress rate
            reprices True Landed Cost. Failing SKUs and capital at risk update
            with the filtered workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-(--card-spacing)">
          <div
            className={
              failingSkus.length > 0
                ? "rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
                : "rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            }
            role="status"
          >
            ⚠️{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 font-semibold text-inherit underline-offset-4 hover:text-primary hover:underline"
              onClick={isolateFailingSkus}
              aria-label="Filter workspace to failing SKUs below minimum margin"
            >
              {failingSkus.length} Failing SKUs
            </Button>{" "}
            below minimum margin. Capital at risk:{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 font-semibold tabular-nums text-inherit underline-offset-4 hover:text-primary hover:underline"
              disabled={failingSkus.length === 0}
              onClick={() => downloadAuditReport(failingSkus)}
              aria-label="Download failing SKUs audit report"
            >
              {formatUsd(capitalAtRiskUsd)}
            </Button>
            .
          </div>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end">
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
              <div className="w-40 space-y-2">
                <Label htmlFor="catalog-fx-rate">Catalog Baseline FX</Label>
                <Input
                  id="catalog-fx-rate"
                  type="number"
                  min={1}
                  step={0.01}
                  value={catalogFxRate}
                  aria-label="Catalog Baseline FX"
                  className="font-mono tabular-nums"
                  onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isFinite(next) && next > 0) {
                      setCatalogFxRate(next);
                    }
                  }}
                />
              </div>
              <div className="shrink-0 rounded-xl bg-muted/60 px-5 py-3 text-right sm:min-w-40">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Live FX rate
                </p>
                <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
                  {formatFx(fxRate)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={
                  isExporting ||
                  isCommittingReprice ||
                  failingSkus.length === 0
                }
                onClick={handleStagePreemptiveReprice}
              >
                Stage Preemptive Reprice
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

      {selectedSkus.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Bulk Logistics Panel</CardTitle>
            <CardDescription>
              {selectedSkus.length} SKUs Selected
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full space-y-2 sm:w-48">
                <Label htmlFor="flat-freight-override">
                  Flat Freight Override (%)
                </Label>
                <Input
                  id="flat-freight-override"
                  type="number"
                  min={0}
                  step={0.1}
                  value={flatFreightOverride}
                  aria-label="Flat Freight Override (%)"
                  className="font-mono tabular-nums"
                  onChange={(event) =>
                    setFlatFreightOverride(event.target.value)
                  }
                />
              </div>
              <div className="w-full space-y-2 sm:w-48">
                <Label htmlFor="flat-duty-override">
                  Flat Duty Override (%)
                </Label>
                <Input
                  id="flat-duty-override"
                  type="number"
                  min={0}
                  step={0.1}
                  value={flatDutyOverride}
                  aria-label="Flat Duty Override (%)"
                  className="font-mono tabular-nums"
                  onChange={(event) => setFlatDutyOverride(event.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={isCommittingLogistics}
                onClick={() => {
                  void handleCommitLogistics();
                }}
              >
                {isCommittingLogistics
                  ? "Committing..."
                  : "Commit Logistics Overrides"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>SKU cross-analysis</CardTitle>
          <CardDescription>
            Expand a SKU to compare supplier True Landed Cost at the current
            FX rate. Hover a TLC value for the freight and duty breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <MarginGrid
            catalogFxRate={catalogFxRate}
            committingKey={committingKey}
            currencyMode={currencyMode}
            currentFxRate={deferredFxRate}
            rows={filteredData}
            scarcityPendingSku={scarcityPendingSku}
            selectedSkus={selectedSkus}
            stagedPriceUpdates={stagedPriceUpdates}
            toggleSkuSelection={toggleSkuSelection}
            onCommitOverride={handleCommitOverride}
            onLogisticsChange={updateOverride}
            onSelectAllVisible={selectAllVisibleSkus}
            onToggleScarcity={handleToggleScarcity}
          />
        </CardContent>
      </Card>
    </section>
  );
}
