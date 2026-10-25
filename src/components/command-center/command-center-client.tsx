"use client";

import { FileSpreadsheet, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import { MarginGrid } from "@/components/command-center/margin-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const DEFAULT_FX = 27.5;
const MIN_FX = 20;
const MAX_FX = 35;
const FX_STEP = 0.1;

const MARGIN_HEALTH_ITEMS = [
  { label: "All", value: "all" },
  { label: "Negative (< 0%)", value: "negative" },
  { label: "At Risk (0 - 15%)", value: "at-risk" },
  { label: "Healthy (> 15%)", value: "healthy" },
] as const;

type MarginHealthFilter = (typeof MARGIN_HEALTH_ITEMS)[number]["value"];

function formatFx(value: number) {
  return value.toFixed(2);
}

function isMarginHealthFilter(value: unknown): value is MarginHealthFilter {
  return (
    typeof value === "string" &&
    MARGIN_HEALTH_ITEMS.some((item) => item.value === value)
  );
}

function calculateBestTlc(sku: CommandCenterSku, currentFxRate: number) {
  if (sku.suppliers.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...sku.suppliers.map(
      (supplier) =>
        supplier.fobPriceUsd *
        currentFxRate *
        (1 + supplier.freightPct + supplier.dutyPct),
    ),
  );
}

function calculateMarginPct(retailPriceZmw: number, bestTlc: number) {
  if (!Number.isFinite(retailPriceZmw) || retailPriceZmw <= 0) {
    return null;
  }

  return ((retailPriceZmw - bestTlc) / retailPriceZmw) * 100;
}

function matchesMarginHealth(
  marginPct: number | null,
  filter: MarginHealthFilter,
) {
  if (filter === "all") {
    return true;
  }
  if (marginPct == null || !Number.isFinite(marginPct)) {
    return false;
  }
  if (filter === "negative") {
    return marginPct < 0;
  }
  if (filter === "at-risk") {
    return marginPct >= 0 && marginPct <= 15;
  }
  return marginPct > 15;
}

export function CommandCenterClient({
  initialData,
}: {
  initialData: CommandCenterSku[];
}) {
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const [baselinePrices, setBaselinePrices] = useState<Record<string, number>>(
    {},
  );
  const [marginHealth, setMarginHealth] = useState<MarginHealthFilter>("all");

  const filteredData = useMemo(() => {
    if (marginHealth === "all") {
      return initialData;
    }

    return initialData.filter((sku) => {
      const retailPriceZmw = baselinePrices[sku.internalSku];
      const marginPct = calculateMarginPct(
        retailPriceZmw,
        calculateBestTlc(sku, fxRate),
      );
      return matchesMarginHealth(marginPct, marginHealth);
    });
  }, [baselinePrices, fxRate, initialData, marginHealth]);

  const baselineCount = Object.keys(baselinePrices).length;

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
              <BaselinePriceDialog
                baselineCount={baselineCount}
                onBaselinesParsed={setBaselinePrices}
              />
            </div>
          </div>
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
        <CardContent className="p-0">
          <MarginGrid
            baselinePrices={baselinePrices}
            currentFxRate={fxRate}
            data={filteredData}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function BaselinePriceDialog({
  baselineCount,
  onBaselinesParsed,
}: {
  baselineCount: number;
  onBaselinesParsed: (prices: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const parseCsv = useCallback(
    (file: File) => {
      setParseError(null);
      setFileName(file.name);

      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader(header) {
          return header.replace(/^\uFEFF/, "").trim();
        },
        complete(results) {
          const rows = results.data;
          const headerKeys = results.meta.fields ?? Object.keys(rows[0] ?? {});
          const skuKey = headerKeys.find(
            (key) => key.toLowerCase() === "internalsku",
          );
          const priceKey = headerKeys.find(
            (key) => key.toLowerCase() === "retailpricezmw",
          );

          if (!skuKey || !priceKey) {
            setParseError(
              "CSV must include internalSku and retailPriceZmw columns.",
            );
            return;
          }

          const next: Record<string, number> = {};
          for (const row of rows) {
            const sku = String(row[skuKey] ?? "").trim();
            const price = Number(String(row[priceKey] ?? "").replace(/,/g, ""));
            if (!sku || !Number.isFinite(price) || price <= 0) {
              continue;
            }
            next[sku] = price;
          }

          const count = Object.keys(next).length;
          if (count === 0) {
            setParseError("No valid internalSku / retailPriceZmw rows found.");
            return;
          }

          onBaselinesParsed(next);
          setOpen(false);
        },
        error(error) {
          setParseError(error.message);
        },
      });
    },
    [onBaselinesParsed],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) parseCsv(file);
    },
    [parseCsv],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { "text/csv": [".csv"] },
      multiple: false,
      maxFiles: 1,
      onDropRejected() {
        setFileName(null);
        setParseError("Only .csv files are accepted.");
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setParseError(null);
          setFileName(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        Set Baseline Prices
        {baselineCount > 0 ? (
          <Badge variant="secondary">{baselineCount}</Badge>
        ) : null}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set baseline retail prices</DialogTitle>
          <DialogDescription>
            Upload a CSV with <code>internalSku</code> and{" "}
            <code>retailPriceZmw</code> to score live margin health.
          </DialogDescription>
        </DialogHeader>
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            isDragActive && !isDragReject && "border-primary bg-primary/5",
            isDragReject && "border-destructive bg-destructive/5",
            !isDragActive && "border-border hover:border-primary/50",
          )}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">
            {isDragActive
              ? "Drop the CSV file here"
              : "Drag and drop a CSV file, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Required columns: internalSku, retailPriceZmw
          </p>
        </div>
        {fileName ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <FileSpreadsheet data-icon="inline-start" />
              {fileName}
            </Badge>
          </div>
        ) : null}
        {parseError ? (
          <p className="text-sm text-destructive" role="alert">
            {parseError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
