"use server";

import { db } from "@/db";
import { supplierMappingTemplates } from "@/db/schema";

export type SaveMappingTemplateResult =
  | { success: true }
  | { success: false; error: string };

export async function saveMappingTemplate(
  supplierName: string,
  mappings: any[],
): Promise<SaveMappingTemplateResult> {
  const trimmedName = supplierName.trim();

  if (!trimmedName) {
    return { success: false, error: "Supplier name is required." };
  }

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return { success: false, error: "At least one column mapping is required." };
  }

  try {
    const updatedAt = new Date();

    await db
      .insert(supplierMappingTemplates)
      .values({
        supplierName: trimmedName,
        mappings,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: supplierMappingTemplates.supplierName,
        set: {
          mappings,
          updatedAt,
        },
      });

    return { success: true };
  } catch (error) {
    console.error("[saveMappingTemplate]", error);
    return {
      success: false,
      error: "Failed to save mapping template. Please try again.",
    };
  }
}
