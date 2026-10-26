"use client";

import { UserButton } from "@clerk/nextjs";
import {
  Activity,
  BarChart3,
  FileText,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  COMMAND_CENTER_FILTER_KEYS,
  isCurrencyMode,
  isMarginHealthFilter,
  MARGIN_HEALTH_ITEMS,
  parseCurrencyMode,
  parseMarginHealth,
} from "@/lib/command-center-filters";

const navItems = [
  {
    title: "Ingestion",
    href: "/ingestion",
    icon: UploadCloud,
  },
  {
    title: "Command Center",
    href: "/command-center",
    icon: Activity,
  },
  {
    title: "Price Lists",
    href: "/price-lists",
    icon: FileText,
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
] as const;

function CommandCenterRefineFilters() {
  const pathname = usePathname();
  const router = useRouter();
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

  const [skuInput, setSkuInput] = useState(skuSearch);
  const [nameInput, setNameInput] = useState(nameSearch);
  const [supplierInput, setSupplierInput] = useState(supplierSearch);

  useEffect(() => {
    setSkuInput(skuSearch);
  }, [skuSearch]);

  useEffect(() => {
    setNameInput(nameSearch);
  }, [nameSearch]);

  useEffect(() => {
    setSupplierInput(supplierSearch);
  }, [supplierSearch]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (
      value === "" ||
      (key === COMMAND_CENTER_FILTER_KEYS.margin && value === "all")
    ) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const debouncedUpdateFilter = useDebouncedCallback(
    (key: string, value: string) => {
      updateFilter(key, value);
    },
    300,
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Refine Data</SidebarGroupLabel>
      <SidebarGroupContent className="space-y-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="cc-filter-sku"
            className="text-xs text-sidebar-foreground/70"
          >
            SKU
          </Label>
          <SidebarInput
            id="cc-filter-sku"
            value={skuInput}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search SKU..."
            className="font-mono"
            onChange={(event) => {
              const next = event.target.value;
              setSkuInput(next);
              debouncedUpdateFilter(COMMAND_CENTER_FILTER_KEYS.sku, next);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="cc-filter-name"
            className="text-xs text-sidebar-foreground/70"
          >
            Product Name
          </Label>
          <SidebarInput
            id="cc-filter-name"
            value={nameInput}
            autoComplete="off"
            placeholder="Search product name..."
            onChange={(event) => {
              const next = event.target.value;
              setNameInput(next);
              debouncedUpdateFilter(COMMAND_CENTER_FILTER_KEYS.name, next);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="cc-filter-supplier"
            className="text-xs text-sidebar-foreground/70"
          >
            Supplier
          </Label>
          <SidebarInput
            id="cc-filter-supplier"
            value={supplierInput}
            autoComplete="off"
            placeholder="Search supplier..."
            onChange={(event) => {
              const next = event.target.value;
              setSupplierInput(next);
              debouncedUpdateFilter(COMMAND_CENTER_FILTER_KEYS.supplier, next);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="cc-filter-margin"
            className="text-xs text-sidebar-foreground/70"
          >
            Margin Health
          </Label>
          <Select
            items={[...MARGIN_HEALTH_ITEMS]}
            value={marginHealth}
            onValueChange={(value) => {
              if (isMarginHealthFilter(value)) {
                updateFilter(COMMAND_CENTER_FILTER_KEYS.margin, value);
              }
            }}
          >
            <SelectTrigger
              id="cc-filter-margin"
              className="w-full min-w-0"
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
        <div className="space-y-1.5">
          <Label
            htmlFor="cc-filter-currency"
            className="text-xs text-sidebar-foreground/70"
          >
            Currency
          </Label>
          <Tabs
            value={currencyMode}
            onValueChange={(value) => {
              if (isCurrencyMode(value)) {
                updateFilter(COMMAND_CENTER_FILTER_KEYS.currency, value);
              }
            }}
          >
            <TabsList
              id="cc-filter-currency"
              className="w-full"
              aria-label="Currency view"
            >
              <TabsTrigger value="USD" className="flex-1">
                USD
              </TabsTrigger>
              <TabsTrigger value="ZMW" className="flex-1">
                ZMW
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function CommandCenterRefineFiltersFallback() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Refine Data</SidebarGroupLabel>
      <SidebarGroupContent className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="pointer-events-none"
              tooltip="Lua Lua Margin Engine"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                LL
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  Lua Lua Margin Engine
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  4-module margin desk
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {pathname === "/command-center" ? (
          <Suspense fallback={<CommandCenterRefineFiltersFallback />}>
            <CommandCenterRefineFilters />
          </Suspense>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 overflow-hidden px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <UserButton />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
