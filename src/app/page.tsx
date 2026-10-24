"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Landmark, PackageSearch, TriangleAlert } from "lucide-react";

import { getAlerts, type MarginAlert } from "@/app/actions/get-alerts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DEFAULT_FX = 27.5;
const MIN_FX = 20;
const MAX_FX = 35;
const FX_STEP = 0.1;

type AlertView = MarginAlert & { landedUsd: number };

function toLandedUsd(alert: MarginAlert): number {
  const baseFx = alert.fxRateUsed > 0 ? alert.fxRateUsed : DEFAULT_FX;
  return alert.trueLandedCostZmw / baseFx;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatZmw(value: number) {
  return `ZMW ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatFx(value: number) {
  return value.toFixed(2);
}

export default function Home() {
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const rows = await getAlerts();
        setAlerts(
          rows.map((row) => ({
            ...row,
            landedUsd: toLandedUsd(row),
          })),
        );
        setError(null);
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Failed to load margin alerts";
        setError(message);
      }
    });
  }, []);

  const stressedRows = useMemo(
    () =>
      alerts.map((alert) => {
        const trueLandedCostZmw = alert.landedUsd * fxRate;
        const newMarginPct =
          alert.retailPriceZmw === 0
            ? 0
            : ((alert.retailPriceZmw - trueLandedCostZmw) /
                alert.retailPriceZmw) *
              100;

        return {
          ...alert,
          trueLandedCostZmw,
          newMarginPct,
        };
      }),
    [alerts, fxRate],
  );

  const valueAtRisk = useMemo(
    () =>
      stressedRows.reduce(
        (sum, row) => sum + (row.retailPriceZmw - row.trueLandedCostZmw),
        0,
      ),
    [stressedRows],
  );

  const criticalCount = useMemo(
    () => stressedRows.filter((row) => row.newMarginPct < 0).length,
    [stressedRows],
  );

  const loading = isPending && alerts.length === 0 && !error;

  return (
    <main className="flex-1 bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10 lg:px-16">
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-6">
          <Badge
            variant="outline"
            className="rounded-none border-slate-600 text-slate-300"
          >
            Live FX stress desk
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              TLC Margin Command Center
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Stress True Landed Cost against a moving USD/ZMW rate. Retail
              stays fixed in kwacha; landed cost and margin reprice in the
              browser as the slider moves.
            </p>
          </div>
        </header>

        <Card className="rounded-none border-slate-800 bg-slate-900 ring-slate-800">
          <CardHeader className="border-b border-slate-800">
            <CardTitle className="text-slate-100">FX Stress Test</CardTitle>
            <CardDescription className="text-slate-400">
              USD/ZMW exchange rate. Default {formatFx(DEFAULT_FX)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-4">
                <label
                  htmlFor="fx-rate"
                  className="text-sm font-medium text-slate-300"
                >
                  USD / ZMW
                </label>
                <p className="font-mono text-2xl tabular-nums text-slate-50">
                  {formatFx(fxRate)}
                </p>
              </div>
              <input
                id="fx-rate"
                type="range"
                min={MIN_FX}
                max={MAX_FX}
                step={FX_STEP}
                value={fxRate}
                onChange={(event) => setFxRate(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-none bg-slate-700 accent-slate-200"
              />
              <div className="flex justify-between font-mono text-xs tabular-nums text-slate-500">
                <span>{formatFx(MIN_FX)}</span>
                <span>{formatFx(DEFAULT_FX)} baseline</span>
                <span>{formatFx(MAX_FX)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-none border-slate-800 bg-slate-900 ring-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription className="text-slate-400">
                  Monitored SKUs
                </CardDescription>
                <PackageSearch className="size-4 text-slate-500" />
              </div>
              <CardTitle className="font-mono text-3xl tabular-nums text-slate-50">
                {loading ? "—" : alerts.length.toLocaleString("en-US")}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-none border-slate-800 bg-slate-900 ring-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription className="text-slate-400">
                  Current FX Rate
                </CardDescription>
                <Landmark className="size-4 text-slate-500" />
              </div>
              <CardTitle className="font-mono text-3xl tabular-nums text-slate-50">
                {formatFx(fxRate)}
              </CardTitle>
              <CardDescription className="text-slate-500">
                USD/ZMW
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="rounded-none border-slate-800 bg-slate-900 ring-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription className="text-slate-400">
                  Value at Risk
                </CardDescription>
                <TriangleAlert className="size-4 text-slate-500" />
              </div>
              <CardTitle
                className={`font-mono text-3xl tabular-nums ${
                  valueAtRisk < 0 ? "text-red-300" : "text-slate-50"
                }`}
              >
                {loading ? "—" : formatZmw(valueAtRisk)}
              </CardTitle>
              <CardDescription className="text-slate-500">
                Sum of retail minus landed cost
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card className="rounded-none border-slate-800 bg-slate-900 ring-slate-800">
          <CardHeader className="border-b border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-slate-100">Margin Alerts</CardTitle>
                <CardDescription className="text-slate-400">
                  {loading
                    ? "Loading alerts from the margin engine…"
                    : `${stressedRows.length.toLocaleString("en-US")} SKUs · ${criticalCount.toLocaleString("en-US")} critical at ${formatFx(fxRate)} FX`}
                </CardDescription>
              </div>
              {criticalCount > 0 ? (
                <Badge variant="destructive" className="rounded-none">
                  {criticalCount} CRITICAL
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <p className="px-4 py-8 text-sm text-red-300">{error}</p>
            ) : (
              <div className="max-h-[640px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-900">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">SKU</TableHead>
                      <TableHead className="text-slate-400">
                        Product Name
                      </TableHead>
                      <TableHead className="text-slate-400">Supplier</TableHead>
                      <TableHead className="text-right text-slate-400">
                        FOB Cost (USD)
                      </TableHead>
                      <TableHead className="text-right text-slate-400">
                        Landed Cost (ZMW)
                      </TableHead>
                      <TableHead className="text-right text-slate-400">
                        Retail (ZMW)
                      </TableHead>
                      <TableHead className="text-right text-slate-400">
                        Margin (%)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-slate-800">
                        <TableCell
                          colSpan={7}
                          className="py-10 text-center text-slate-500"
                        >
                          Fetching margin alerts…
                        </TableCell>
                      </TableRow>
                    ) : stressedRows.length === 0 ? (
                      <TableRow className="border-slate-800">
                        <TableCell
                          colSpan={7}
                          className="py-10 text-center text-slate-500"
                        >
                          No margin alerts found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stressedRows.map((row) => {
                        const isCritical = row.newMarginPct < 0;

                        return (
                          <TableRow
                            key={row.id}
                            className={
                              isCritical
                                ? "border-slate-800 bg-red-500/15 hover:bg-red-500/20"
                                : "border-slate-800 hover:bg-slate-800/80"
                            }
                          >
                            <TableCell className="font-mono text-slate-200">
                              {row.sku}
                            </TableCell>
                            <TableCell className="max-w-64 truncate text-slate-200">
                              {row.productName}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {row.supplier}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-slate-200">
                              {formatUsd(row.fobCostUsd)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-slate-200">
                              {formatZmw(row.trueLandedCostZmw)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-slate-200">
                              {formatZmw(row.retailPriceZmw)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isCritical ? (
                                  <Badge
                                    variant="destructive"
                                    className="rounded-none"
                                  >
                                    CRITICAL
                                  </Badge>
                                ) : null}
                                <span
                                  className={`font-mono tabular-nums ${
                                    isCritical
                                      ? "text-red-300"
                                      : "text-slate-200"
                                  }`}
                                >
                                  {formatPct(row.newMarginPct)}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
