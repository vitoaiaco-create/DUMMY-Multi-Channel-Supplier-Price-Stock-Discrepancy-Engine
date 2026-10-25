"use client";

import { useState } from "react";

import type { CommandCenterSku } from "@/app/actions/get-alerts";
import { MarginGrid } from "@/components/command-center/margin-grid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const DEFAULT_FX = 27.5;
const MIN_FX = 20;
const MAX_FX = 35;
const FX_STEP = 0.1;

function formatFx(value: number) {
  return value.toFixed(2);
}

export function CommandCenterClient({
  initialData,
}: {
  initialData: CommandCenterSku[];
}) {
  const [fxRate, setFxRate] = useState(DEFAULT_FX);

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
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
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
            <div className="shrink-0 rounded-xl bg-muted/60 px-5 py-3 text-right sm:min-w-40">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Live FX rate
              </p>
              <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
                {formatFx(fxRate)}
              </p>
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
          <MarginGrid currentFxRate={fxRate} data={initialData} />
        </CardContent>
      </Card>
    </section>
  );
}
