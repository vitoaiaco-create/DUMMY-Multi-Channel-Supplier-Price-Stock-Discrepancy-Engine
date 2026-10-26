import type { CurrencyMode } from "@/lib/command-center-pricing";

export const COMMAND_CENTER_FILTER_KEYS = {
  sku: "sku",
  name: "name",
  supplier: "supplier",
  margin: "margin",
  currency: "currency",
} as const;

export const MARGIN_HEALTH_ITEMS = [
  { label: "All", value: "all" },
  { label: "Below Min", value: "red" },
  { label: "Below Target", value: "amber" },
  { label: "On Target", value: "green" },
] as const;

export type MarginHealthFilter = (typeof MARGIN_HEALTH_ITEMS)[number]["value"];

export function isMarginHealthFilter(
  value: unknown,
): value is MarginHealthFilter {
  return (
    typeof value === "string" &&
    MARGIN_HEALTH_ITEMS.some((item) => item.value === value)
  );
}

export function isCurrencyMode(value: unknown): value is CurrencyMode {
  return value === "USD" || value === "ZMW";
}

export function parseMarginHealth(value: string | null): MarginHealthFilter {
  return isMarginHealthFilter(value) ? value : "all";
}

export function parseCurrencyMode(value: string | null): CurrencyMode {
  return isCurrencyMode(value) ? value : "ZMW";
}
