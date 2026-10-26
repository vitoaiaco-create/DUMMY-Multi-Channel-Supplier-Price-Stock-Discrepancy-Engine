"use client";

import { ChevronDown, ChevronRight, CircleAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calculateCurrentMarginPct,
  calculateLiveRetailZmw,
  formatFx,
  formatMoney,
  formatUsd,
  formatZmw,
  getFxPressure,
  getMarginHealthStatus,
  toDisplayCurrency,
  toDisplayPct,
  type CurrencyMode,
  type LogisticsOverride,
  type PricedSku,
  type SupplierOffer,
  type SupplierTlc,
} from "@/lib/command-center-pricing";
import { cn } from "@/lib/utils";

function formatMarginPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function isReviewRequired(reviewDate: string | null) {
  if (!reviewDate) {
    return false;
  }
  const parsed = new Date(reviewDate);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() < Date.now();
}

function MarginHealthBadge({
  currentMarginPct,
  minMarginPct,
  targetMarginPct,
}: {
  currentMarginPct: number | null;
  minMarginPct: number;
  targetMarginPct: number;
}) {
  const status = getMarginHealthStatus(
    currentMarginPct,
    minMarginPct,
    targetMarginPct,
  );

  if (status === "none" || currentMarginPct == null) {
    return <Badge variant="secondary">No Retail</Badge>;
  }

  if (status === "red") {
    return (
      <Badge variant="destructive">{formatMarginPct(currentMarginPct)}</Badge>
    );
  }

  if (status === "amber") {
    return (
      <Badge className="border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-400">
        {formatMarginPct(currentMarginPct)}
      </Badge>
    );
  }

  return (
    <Badge className="border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-400">
      {formatMarginPct(currentMarginPct)}
    </Badge>
  );
}

function BreakevenFxCell({
  breakevenFx,
  currentFxRate,
}: {
  breakevenFx: number | null;
  currentFxRate: number;
}) {
  if (breakevenFx == null || !Number.isFinite(breakevenFx)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const pressure = getFxPressure(currentFxRate, breakevenFx);

  return (
    <div className="flex items-center gap-2 font-mono tabular-nums">
      <span>{formatFx(breakevenFx)}</span>
      {pressure === "amber" ? (
        <TriangleAlert
          aria-label="Current FX is within 1.00 ZMW of breakeven"
          className="size-4 text-amber-600 dark:text-amber-400"
        />
      ) : null}
      {pressure === "red" ? (
        <CircleAlert
          aria-label="Current FX exceeds breakeven"
          className="size-4 text-destructive"
        />
      ) : null}
    </div>
  );
}

export function MarginGrid({
  catalogFxRate,
  committingKey,
  currencyMode,
  currentFxRate,
  onCommitOverride,
  onLogisticsChange,
  onSelectAllVisible,
  onToggleScarcity,
  rows,
  scarcityPendingSku,
  selectedSkus,
  stagedPriceUpdates,
  toggleSkuSelection,
}: {
  catalogFxRate: number;
  committingKey: string | null;
  currencyMode: CurrencyMode;
  currentFxRate: number;
  onCommitOverride: (group: PricedSku, supplier: SupplierTlc) => void;
  onLogisticsChange: (
    internalSku: string,
    supplier: SupplierOffer,
    field: keyof LogisticsOverride,
    nextDisplayPct: number,
  ) => void;
  onSelectAllVisible: (selected: boolean) => void;
  onToggleScarcity: (sku: CommandCenterSku, isActive: boolean) => void;
  rows: PricedSku[];
  scarcityPendingSku: string | null;
  selectedSkus: string[];
  stagedPriceUpdates: Record<string, number>;
  toggleSkuSelection: (internalSku: string) => void;
}) {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedSkuSet = new Set(selectedSkus);
  const selectedVisibleCount = rows.reduce(
    (count, row) => count + (selectedSkuSet.has(row.internalSku) ? 1 : 0),
    0,
  );
  const allVisibleSelected =
    rows.length > 0 && selectedVisibleCount === rows.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < rows.length;

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
          <TableHead className="w-10">
            <Checkbox
              checked={allVisibleSelected}
              disabled={rows.length === 0}
              indeterminate={someVisibleSelected}
              aria-label="Select all currently visible SKUs"
              onCheckedChange={(checked) => onSelectAllVisible(Boolean(checked))}
            />
          </TableHead>
          <TableHead className="w-10" />
          <TableHead>Internal SKU</TableHead>
          <TableHead>Product Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">
            Target Cost ({currencyMode})
          </TableHead>
          <TableHead className="text-right">
            Retail Price ({currencyMode})
          </TableHead>
          <TableHead className="text-right">Target Margin %</TableHead>
          <TableHead className="text-right">Min Margin %</TableHead>
          <TableHead>Primary Supplier</TableHead>
          <TableHead className="text-right">Current Warehouse Stock</TableHead>
          <TableHead className="text-right">
            Live Retail ({currencyMode})
          </TableHead>
          <TableHead className="text-right">
            Best TLC ({currencyMode})
          </TableHead>
          <TableHead>Suppliers Available</TableHead>
          <TableHead>Margin Health</TableHead>
          <TableHead>Breakeven FX</TableHead>
          <TableHead>Market Scarcity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={17}
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
                catalogFxRate={catalogFxRate}
                committingKey={committingKey}
                currencyMode={currencyMode}
                currentFxRate={currentFxRate}
                group={group}
                isExpanded={isExpanded}
                isSelected={selectedSkuSet.has(group.internalSku)}
                scarcityPending={scarcityPendingSku === group.internalSku}
                stagedRetailUsd={stagedPriceUpdates[group.internalSku]}
                onCommitOverride={onCommitOverride}
                onLogisticsChange={onLogisticsChange}
                onToggle={() => toggleSku(group.internalSku)}
                onToggleScarcity={onToggleScarcity}
                onToggleSkuSelection={toggleSkuSelection}
              />
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function SkuExpandableRows({
  catalogFxRate,
  committingKey,
  currencyMode,
  currentFxRate,
  group,
  isExpanded,
  isSelected,
  onCommitOverride,
  onLogisticsChange,
  onToggle,
  onToggleScarcity,
  onToggleSkuSelection,
  scarcityPending,
  stagedRetailUsd,
}: {
  catalogFxRate: number;
  committingKey: string | null;
  currencyMode: CurrencyMode;
  currentFxRate: number;
  group: PricedSku;
  isExpanded: boolean;
  isSelected: boolean;
  onCommitOverride: (group: PricedSku, supplier: SupplierTlc) => void;
  onLogisticsChange: (
    internalSku: string,
    supplier: SupplierOffer,
    field: keyof LogisticsOverride,
    nextDisplayPct: number,
  ) => void;
  onToggle: () => void;
  onToggleScarcity: (sku: CommandCenterSku, isActive: boolean) => void;
  onToggleSkuSelection: (internalSku: string) => void;
  scarcityPending: boolean;
  stagedRetailUsd?: number;
}) {
  const reviewRequired = isReviewRequired(group.scarcityReviewDate);
  const scarcitySwitchId = `scarcity-${group.internalSku}`;
  const isStaged = stagedRetailUsd != null;
  const displayRetailUsd = isStaged ? stagedRetailUsd : group.retailPriceUsd;
  const displayLiveRetailZmw = calculateLiveRetailZmw(
    displayRetailUsd,
    catalogFxRate,
  );
  const bestTlcZmw = group.bestTlcUsd * currentFxRate;
  const displayLiveRetail =
    currencyMode === "ZMW" ? displayLiveRetailZmw : displayRetailUsd;
  const displayMarginPct = calculateCurrentMarginPct(
    displayLiveRetailZmw,
    bestTlcZmw,
  );
  const displayTargetCost = toDisplayCurrency(
    group.targetCostUsd,
    currencyMode,
    currentFxRate,
  );
  const displayRetailPrice = toDisplayCurrency(
    displayRetailUsd,
    currencyMode,
    currentFxRate,
  );
  const displayBestTlc =
    currencyMode === "ZMW" ? bestTlcZmw : group.bestTlcUsd;

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer",
          isStaged && "bg-blue-500/10 hover:bg-blue-500/15",
        )}
        aria-expanded={isExpanded}
        data-state={isSelected ? "selected" : undefined}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
      >
        <TableCell
          className="w-10"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            aria-label={`Select ${group.internalSku}`}
            onCheckedChange={() => onToggleSkuSelection(group.internalSku)}
          />
        </TableCell>
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
        <TableCell>{group.category ?? "—"}</TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMoney(displayTargetCost, currencyMode)}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMoney(displayRetailPrice, currencyMode)}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMarginPct(group.targetMarginPct)}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMarginPct(group.minMarginPct)}
        </TableCell>
        <TableCell className="font-mono">
          {group.primarySupplier ?? "—"}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {group.currentWarehouseStock}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMoney(displayLiveRetail, currencyMode)}
        </TableCell>
        <TableCell className="text-right font-mono font-semibold tabular-nums">
          {formatMoney(displayBestTlc, currencyMode)}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {group.suppliers.length}{" "}
            {group.suppliers.length === 1 ? "supplier" : "suppliers"}
          </Badge>
        </TableCell>
        <TableCell>
          <MarginHealthBadge
            currentMarginPct={displayMarginPct}
            minMarginPct={group.minMarginPct}
            targetMarginPct={group.targetMarginPct}
          />
        </TableCell>
        <TableCell>
          <BreakevenFxCell
            breakevenFx={group.breakevenFx}
            currentFxRate={currentFxRate}
          />
        </TableCell>
        <TableCell>
          <div
            className="flex flex-col items-start gap-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Switch
                id={scarcitySwitchId}
                checked={group.scarcityPremiumActive}
                disabled={scarcityPending}
                onCheckedChange={(checked) =>
                  onToggleScarcity(group, Boolean(checked))
                }
                aria-label={`Market Scarcity (+10%) for ${group.internalSku}`}
              />
              <Label htmlFor={scarcitySwitchId} className="text-xs font-normal">
                Market Scarcity (+10%)
              </Label>
            </div>
            {reviewRequired ? (
              <Badge variant="destructive">Review Required</Badge>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={17} className="bg-muted/30 p-0 whitespace-normal">
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
                    <TableHead />
                    <TableHead className="text-right">TLC (ZMW)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.suppliers.map((supplier) => {
                    const isBest =
                      group.bestSupplier?.supplierName ===
                      supplier.supplierName;
                    const commitKey = `${group.internalSku}::${supplier.supplierName}`;

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
                        <TableCell>
                          {supplier.isOverridden ? (
                            <Button
                              size="sm"
                              disabled={committingKey === commitKey}
                              onClick={(event) => {
                                event.stopPropagation();
                                onCommitOverride(group, supplier);
                              }}
                            >
                              {committingKey === commitKey
                                ? "Saving..."
                                : "Commit"}
                            </Button>
                          ) : null}
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
