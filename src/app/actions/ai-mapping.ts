"use server";

import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

const MASTER_CATALOG_FIELDS = [
  "internalSku",
  "productName",
  "category",
  "benchmarkCost",
  "retailPrice",
  "minMarginPct",
  "currentStock",
] as const;

const columnMappingSchema = z.object({
  mappings: z
    .array(
      z.object({
        supplierHeader: z
          .string()
          .describe("The exact column name from the CSV."),
        mappedDbField: z
          .string()
          .describe(
            `The corresponding field from masterCatalog (${MASTER_CATALOG_FIELDS.join(", ")}). If a column is junk or irrelevant, map it to "ignore".`,
          ),
        confidence: z
          .number()
          .min(0)
          .max(100)
          .describe("How confident the AI is in this specific mapping (0-100)."),
        reasoning: z
          .string()
          .describe(
            "A brief 1-sentence explanation of why it chose this mapping.",
          ),
      }),
    )
    .describe("One mapping entry for every supplier CSV header."),
});

export type ColumnMapping = z.infer<
  typeof columnMappingSchema
>["mappings"][number];

export type AiMappingResult =
  | {
      success: true;
      mappings: ColumnMapping[];
    }
  | {
      success: false;
      error: string;
    };

export async function generateAiMapping(
  headers: string[],
  sampleRows: string[][],
): Promise<AiMappingResult> {
  try {
    const { output } = await generateText({
      model: openai("gpt-4o-mini"),
      output: Output.object({
        schema: columnMappingSchema,
        name: "ColumnMapping",
        description:
          "Proposed mapping from supplier CSV columns to masterCatalog fields.",
      }),
      system: `You are an automotive/industrial spare parts data architect. I am providing you with the CSV headers and the first 3 rows of data from a supplier's price list. Map these columns to our internal database schema: ${MASTER_CATALOG_FIELDS.join(", ")}. If a column is irrelevant (e.g., 'Notes', 'Internal ID'), map it to 'ignore'.`,
      prompt: [
        "Map every supplier CSV header to a masterCatalog field or ignore.",
        "",
        `CSV headers: ${JSON.stringify(headers)}`,
        "",
        `First 3 sample rows: ${JSON.stringify(sampleRows)}`,
      ].join("\n"),
    });

    if (!output) {
      return { success: false, error: "AI mapping returned no output." };
    }

    return {
      success: true,
      mappings: output.mappings,
    };
  } catch (error) {
    console.error("[generateAiMapping]", error);
    return {
      success: false,
      error: "AI mapping failed. Please try again.",
    };
  }
}
