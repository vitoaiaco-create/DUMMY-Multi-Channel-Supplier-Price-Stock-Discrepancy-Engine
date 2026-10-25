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

type SupplierTlc = SupplierOffer & {
  baseFobZmw: number;
  freightZmw: number;
  dutyZmw: number;
  tlcZmw: number;
};

type SkuTlcGroup = Omit<SkuGroup, "suppliers"> & {
  suppliers: SupplierTlc[];
  bestTlc: number;
};

function calculateTlc(
  supplier: SupplierOffer,
  currentFxRate: number,
): SupplierTlc {
  const baseFobZmw = supplier.fobPriceUsd * currentFxRate;
  const freightZmw = baseFobZmw * supplier.freightPct;
  const dutyZmw = baseFobZmw * supplier.dutyPct;
  const tlcZmw =
    (supplier.fobPriceUsd * currentFxRate) *
    (1 + supplier.freightPct + supplier.dutyPct);

  return {
    ...supplier,
    baseFobZmw,
    freightZmw,
    dutyZmw,
    tlcZmw,
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

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function MarginGrid({
  currentFxRate,
  data,
}: {
  currentFxRate: number;
  data: SkuGroup[];
}) {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(
    () => new Set(),
  );

  const rows = useMemo(
    () =>
      data.map((group) => {
        const suppliers = group.suppliers.map((supplier) =>
          calculateTlc(supplier, currentFxRate),
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
    [currentFxRate, data],
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>Internal SKU</TableHead>
          <TableHead>Product Name</TableHead>
          <TableHead>Suppliers Available</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={4}
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
                group={group}
                isExpanded={isExpanded}
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
  group,
  isExpanded,
  onToggle,
}: {
  group: SkuTlcGroup;
  isExpanded: boolean;
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
      </TableRow>
      {isExpanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="bg-muted/30 p-0 whitespace-normal">
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
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPct(supplier.freightPct)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPct(supplier.dutyPct)}
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
