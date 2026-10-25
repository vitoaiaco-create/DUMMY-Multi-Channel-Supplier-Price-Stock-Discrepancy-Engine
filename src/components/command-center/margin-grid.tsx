"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SupplierOffer = CommandCenterSku["suppliers"][number];
type SkuGroup = CommandCenterSku;

type LogisticsOverride = {
  freightPct: number;
  dutyPct: number;
};

type SupplierTlc = SupplierOffer & {
  baseFobZmw: number;
  freightZmw: number;
  dutyZmw: number;
  tlcZmw: number;
  effectiveFreightPct: number;
  effectiveDutyPct: number;
  isOverridden: boolean;
};

type SkuTlcGroup = Omit<SkuGroup, "suppliers"> & {
  suppliers: SupplierTlc[];
  bestTlc: number;
};

function overrideKey(internalSku: string, supplierName: string) {
  return `${internalSku}::${supplierName}`;
}

function ratesMatch(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

function toDisplayPct(rate: number) {
  return Number((rate * 100).toFixed(4));
}

function calculateTlc(
  supplier: SupplierOffer,
  currentFxRate: number,
  override?: LogisticsOverride,
): SupplierTlc {
  const effectiveFreightPct = override?.freightPct ?? supplier.freightPct;
  const effectiveDutyPct = override?.dutyPct ?? supplier.dutyPct;
  const baseFobZmw = supplier.fobPriceUsd * currentFxRate;
  const freightZmw = baseFobZmw * effectiveFreightPct;
  const dutyZmw = baseFobZmw * effectiveDutyPct;
  const tlcZmw =
    supplier.fobPriceUsd *
    currentFxRate *
    (1 + effectiveFreightPct + effectiveDutyPct);

  return {
    ...supplier,
    baseFobZmw,
    freightZmw,
    dutyZmw,
    tlcZmw,
    effectiveFreightPct,
    effectiveDutyPct,
    isOverridden: Boolean(override),
  };
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

function formatMarginPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function MarginHealthBadge({
  bestTlc,
  retailPriceZmw,
}: {
  bestTlc: number;
  retailPriceZmw?: number;
}) {
  if (retailPriceZmw == null || !Number.isFinite(retailPriceZmw)) {
    return <Badge variant="secondary">No Baseline</Badge>;
  }

  const marginPct = ((retailPriceZmw - bestTlc) / retailPriceZmw) * 100;

  if (marginPct < 0) {
    return <Badge variant="destructive">{formatMarginPct(marginPct)}</Badge>;
  }

  if (marginPct <= 15) {
    return (
      <Badge className="border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-400">
        {formatMarginPct(marginPct)}
      </Badge>
    );
  }

  return (
    <Badge className="border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-400">
      {formatMarginPct(marginPct)}
    </Badge>
  );
}

export function MarginGrid({
  baselinePrices,
  currentFxRate,
  data,
}: {
  baselinePrices: Record<string, number>;
  currentFxRate: number;
  data: SkuGroup[];
}) {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(
    () => new Set(),
  );
  const [overrides, setOverrides] = useState<Record<string, LogisticsOverride>>(
    {},
  );

  const rows = useMemo(
    () =>
      data.map((group) => {
        const suppliers = group.suppliers.map((supplier) =>
          calculateTlc(
            supplier,
            currentFxRate,
            overrides[overrideKey(group.internalSku, supplier.supplierName)],
          ),
        );
        const bestTlc =
          suppliers.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.min(...suppliers.map((supplier) => supplier.tlcZmw));

        return {
          ...group,
          suppliers,
          bestTlc,
        };
      }),
    [currentFxRate, data, overrides],
  );

  function toggleSku(internalSku: string) {
    setExpandedSkus((current) => {
      const next = new Set(current);
      if (next.has(internalSku)) {
        next.delete(internalSku);
      } else {
        next.add(internalSku);
      }
      return next;
    });
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>Internal SKU</TableHead>
          <TableHead>Product Name</TableHead>
          <TableHead>Suppliers Available</TableHead>
          <TableHead>Margin Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="py-10 text-center text-muted-foreground"
            >
              No active supplier pricing found.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((group) => {
            const isExpanded = expandedSkus.has(group.internalSku);

            return (
              <SkuExpandableRows
                key={group.internalSku}
                baselineRetailPrice={baselinePrices[group.internalSku]}
                group={group}
                isExpanded={isExpanded}
                onLogisticsChange={updateOverride}
                onToggle={() => toggleSku(group.internalSku)}
              />
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function SkuExpandableRows({
  baselineRetailPrice,
  group,
  isExpanded,
  onLogisticsChange,
  onToggle,
}: {
  baselineRetailPrice?: number;
  group: SkuTlcGroup;
  isExpanded: boolean;
  onLogisticsChange: (
    internalSku: string,
    supplier: SupplierOffer,
    field: keyof LogisticsOverride,
    nextDisplayPct: number,
  ) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer"
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
      >
        <TableCell className="w-10">
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono font-medium">
          {group.internalSku}
        </TableCell>
        <TableCell>{group.productName}</TableCell>
        <TableCell>
          <Badge variant="secondary">
            {group.suppliers.length}{" "}
            {group.suppliers.length === 1 ? "supplier" : "suppliers"}
          </Badge>
        </TableCell>
        <TableCell>
          <MarginHealthBadge
            bestTlc={group.bestTlc}
            retailPriceZmw={baselineRetailPrice}
          />
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 p-0 whitespace-normal">
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                SKU cross-analysis · {group.internalSku}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">FOB (USD)</TableHead>
                    <TableHead className="text-right">Freight</TableHead>
                    <TableHead className="text-right">Duty</TableHead>
                    <TableHead className="text-right">TLC (ZMW)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.suppliers.map((supplier) => {
                    const isBest = supplier.tlcZmw === group.bestTlc;

                    return (
                      <TableRow
                        key={supplier.supplierName}
                        className={cn(
                          supplier.isOverridden &&
                            "bg-amber-400/20 hover:bg-amber-400/25",
                          !supplier.isOverridden &&
                            isBest &&
                            "bg-emerald-500/10 hover:bg-emerald-500/15",
                        )}
                      >
                        <TableCell className="font-medium">
                          {supplier.supplierName}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatUsd(supplier.fobPriceUsd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <LogisticsPctInput
                            ariaLabel={`Freight percent for ${supplier.supplierName}`}
                            value={toDisplayPct(supplier.effectiveFreightPct)}
                            onValueChange={(next) =>
                              onLogisticsChange(
                                group.internalSku,
                                supplier,
                                "freightPct",
                                next,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <LogisticsPctInput
                            ariaLabel={`Duty percent for ${supplier.supplierName}`}
                            value={toDisplayPct(supplier.effectiveDutyPct)}
                            onValueChange={(next) =>
                              onLogisticsChange(
                                group.internalSku,
                                supplier,
                                "dutyPct",
                                next,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <HoverCard>
                            <HoverCardTrigger className="cursor-help font-mono font-semibold tabular-nums underline decoration-dotted underline-offset-4">
                              {formatZmw(supplier.tlcZmw)}
                            </HoverCardTrigger>
                            <HoverCardContent align="end" className="w-72">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                TLC breakdown · {supplier.supplierName}
                              </p>
                              <dl className="space-y-1.5 font-mono text-xs tabular-nums">
                                <div className="flex items-center justify-between gap-4">
                                  <dt className="text-muted-foreground">
                                    Base FOB (ZMW)
                                  </dt>
                                  <dd>{formatZmw(supplier.baseFobZmw)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <dt className="text-muted-foreground">
                                    + Freight (ZMW)
                                  </dt>
                                  <dd>{formatZmw(supplier.freightZmw)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <dt className="text-muted-foreground">
                                    + Duty (ZMW)
                                  </dt>
                                  <dd>{formatZmw(supplier.dutyZmw)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-4 border-t pt-1.5 font-semibold">
                                  <dt>TLC (ZMW)</dt>
                                  <dd>{formatZmw(supplier.tlcZmw)}</dd>
                                </div>
                              </dl>
                            </HoverCardContent>
                          </HoverCard>
                        </TableCell>
                        <TableCell>
                          {isBest ? (
                            <Badge className="bg-emerald-600 text-white">
                              Best Margin
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function LogisticsPctInput({
  ariaLabel,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  onValueChange: (nextDisplayPct: number) => void;
  value: number;
}) {
  return (
    <div className="ml-auto flex w-24 items-center justify-end gap-1">
      <Input
        type="number"
        min={0}
        step={0.1}
        value={Number.isFinite(value) ? value : ""}
        aria-label={ariaLabel}
        className="h-7 w-16 px-2 text-right font-mono text-xs tabular-nums"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (!Number.isFinite(next) || next < 0) {
            return;
          }
          onValueChange(next);
        }}
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}
