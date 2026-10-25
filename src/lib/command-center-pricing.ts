import type { CommandCenterSku } from "@/app/actions/get-alerts";

export const SCARCITY_MULTIPLIER = 1.1;
export const BREAKEVEN_FX_WARNING_BAND = 1;

export type LogisticsOverride = {
  freightPct: number;
  dutyPct: number;
};

export type SupplierOffer = CommandCenterSku["suppliers"][number];

export type SupplierTlc = SupplierOffer & {
  baseFobZmw: number;
  freightZmw: number;
  dutyZmw: number;
  tlcZmw: number;
  effectiveFreightPct: number;
  effectiveDutyPct: number;
  isOverridden: boolean;
};

export type PricedSku = Omit<CommandCenterSku, "suppliers"> & {
  suppliers: SupplierTlc[];
  bestTlc: number;
  bestTlcUsd: number;
  finalTlc: number;
  bestSupplier: SupplierTlc | null;
  breakevenFx: number | null;
  liveRetailZmw: number;
  currentMarginPct: number | null;
};

export type MarginHealthStatus = "none" | "red" | "amber" | "green";

export type CurrencyMode = "USD" | "ZMW";

export function overrideKey(internalSku: string, supplierName: string) {
  return `${internalSku}::${supplierName}`;
}

export function ratesMatch(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

export function toDisplayPct(rate: number) {
  return Number((rate * 100).toFixed(4));
}

export function calculateTlc(
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

export function calculateBreakevenFx(
  retailPriceZmw: number | undefined,
  supplier: Pick<
    SupplierTlc,
    "fobPriceUsd" | "effectiveFreightPct" | "effectiveDutyPct"
  > | null,
) {
  if (
    retailPriceZmw == null ||
    !Number.isFinite(retailPriceZmw) ||
    retailPriceZmw <= 0 ||
    supplier == null ||
    supplier.fobPriceUsd <= 0
  ) {
    return null;
  }

  const landedUsdFactor =
    supplier.fobPriceUsd *
    (1 + supplier.effectiveFreightPct + supplier.effectiveDutyPct);

  if (landedUsdFactor <= 0) {
    return null;
  }

  return retailPriceZmw / landedUsdFactor;
}

export function getFxPressure(
  currentFxRate: number,
  breakevenFx: number | null,
): "ok" | "amber" | "red" {
  if (breakevenFx == null || !Number.isFinite(breakevenFx)) {
    return "ok";
  }

  if (currentFxRate > breakevenFx) {
    return "red";
  }

  if (breakevenFx - currentFxRate <= BREAKEVEN_FX_WARNING_BAND) {
    return "amber";
  }

  return "ok";
}

export function applyScarcityPremium(tlcZmw: number, isActive: boolean) {
  return isActive ? tlcZmw * SCARCITY_MULTIPLIER : tlcZmw;
}

export function calculateLiveRetailZmw(
  retailPriceUsd: number,
  currentFxRate: number,
) {
  return retailPriceUsd * currentFxRate;
}

export function calculateCurrentMarginPct(
  liveRetailZmw: number,
  bestTlcZmw: number,
) {
  if (!Number.isFinite(liveRetailZmw) || liveRetailZmw <= 0) {
    return null;
  }
  if (!Number.isFinite(bestTlcZmw)) {
    return null;
  }

  return ((liveRetailZmw - bestTlcZmw) / liveRetailZmw) * 100;
}

export function getMarginHealthStatus(
  currentMarginPct: number | null,
  minMarginPct: number,
  targetMarginPct: number,
): MarginHealthStatus {
  if (currentMarginPct == null || !Number.isFinite(currentMarginPct)) {
    return "none";
  }
  if (currentMarginPct < minMarginPct) {
    return "red";
  }
  if (currentMarginPct < targetMarginPct) {
    return "amber";
  }
  return "green";
}

export function priceCommandCenterSku(
  sku: CommandCenterSku,
  currentFxRate: number,
  overrides: Record<string, LogisticsOverride>,
): PricedSku {
  const suppliers = sku.suppliers.map((supplier) =>
    calculateTlc(
      supplier,
      currentFxRate,
      overrides[overrideKey(sku.internalSku, supplier.supplierName)],
    ),
  );
  const bestTlc =
    suppliers.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...suppliers.map((supplier) => supplier.tlcZmw));
  const bestSupplier =
    suppliers.find((supplier) => supplier.tlcZmw === bestTlc) ?? null;
  const liveRetailZmw = calculateLiveRetailZmw(
    sku.retailPriceUsd,
    currentFxRate,
  );
  const bestTlcUsd =
    bestSupplier != null
      ? bestSupplier.fobPriceUsd *
        (1 + bestSupplier.effectiveFreightPct + bestSupplier.effectiveDutyPct)
      : currentFxRate > 0 && Number.isFinite(bestTlc)
        ? bestTlc / currentFxRate
        : 0;

  return {
    ...sku,
    suppliers,
    bestTlc,
    bestTlcUsd,
    finalTlc: applyScarcityPremium(bestTlc, sku.scarcityPremiumActive),
    bestSupplier,
    breakevenFx: calculateBreakevenFx(liveRetailZmw, bestSupplier),
    liveRetailZmw,
    currentMarginPct: calculateCurrentMarginPct(liveRetailZmw, bestTlc),
  };
}

export function formatZmw(value: number) {
  return `ZMW ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatFx(value: number) {
  return value.toFixed(2);
}

export function isBelowMinMargin(row: Pick<PricedSku, "currentMarginPct" | "minMarginPct">) {
  return (
    row.currentMarginPct != null &&
    Number.isFinite(row.currentMarginPct) &&
    row.currentMarginPct < row.minMarginPct
  );
}

export function requiredRetailUsdForMinMargin(
  bestTlcZmw: number,
  minMarginPct: number,
  currentFxRate: number,
) {
  if (
    !Number.isFinite(bestTlcZmw) ||
    bestTlcZmw <= 0 ||
    !Number.isFinite(minMarginPct) ||
    minMarginPct >= 100 ||
    !Number.isFinite(currentFxRate) ||
    currentFxRate <= 0
  ) {
    return null;
  }

  const requiredRetailZmw = bestTlcZmw / (1 - minMarginPct / 100);
  const requiredRetailUsd = requiredRetailZmw / currentFxRate;

  if (!Number.isFinite(requiredRetailUsd) || requiredRetailUsd <= 0) {
    return null;
  }

  // Round up to cents so the committed USD price still clears the floor.
  return Math.ceil(requiredRetailUsd * 100 - Number.EPSILON) / 100;
}

export function formatMoney(value: number, currencyMode: CurrencyMode) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return currencyMode === "USD" ? formatUsd(value) : formatZmw(value);
}

export function toDisplayCurrency(
  usdValue: number,
  currencyMode: CurrencyMode,
  currentFxRate: number,
) {
  if (!Number.isFinite(usdValue)) {
    return Number.NaN;
  }

  return currencyMode === "ZMW" ? usdValue * currentFxRate : usdValue;
}

export function tlcToDisplayCurrency(
  tlcZmw: number,
  currencyMode: CurrencyMode,
  currentFxRate: number,
) {
  if (!Number.isFinite(tlcZmw)) {
    return Number.NaN;
  }

  if (currencyMode === "USD") {
    return currentFxRate > 0 ? tlcZmw / currentFxRate : Number.NaN;
  }

  return tlcZmw;
}
