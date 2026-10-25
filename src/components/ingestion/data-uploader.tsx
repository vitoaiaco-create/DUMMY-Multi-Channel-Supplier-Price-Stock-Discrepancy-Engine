"use client";

import { ArrowRight, Check, FileSpreadsheet, Loader2, Pencil, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
  generateAiMapping,
  type ColumnMapping,
} from "@/app/actions/ai-mapping";
import { saveMappingTemplate } from "@/app/actions/template-memory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const SAMPLE_ROW_COUNT = 3;

const MASTER_CATALOG_FIELDS = [
  "internalSku",
  "productName",
  "category",
  "benchmarkCost",
  "retailPrice",
  "minMarginPct",
  "currentStock",
] as const;

const MAPPING_FIELD_OPTIONS = [...MASTER_CATALOG_FIELDS, "ignore"] as const;

type MappingFieldOption = (typeof MAPPING_FIELD_OPTIONS)[number];

const MAPPING_FIELD_ITEMS = MAPPING_FIELD_OPTIONS.map((field) => ({
  label: field,
  value: field,
}));

function isMappingFieldOption(value: string): value is MappingFieldOption {
  return (MAPPING_FIELD_OPTIONS as readonly string[]).includes(value);
}

type MicroPayload = {
  fileName: string;
  headers: string[];
  sampleRows: string[][];
};

function confidenceVariant(confidence: number) {
  if (confidence >= 80) return "default" as const;
  if (confidence >= 50) return "secondary" as const;
  return "outline" as const;
}

export function DataUploader() {
  const router = useRouter();
  const [payload, setPayload] = useState<MicroPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiMappings, setAiMappings] = useState<ColumnMapping[] | null>(null);
  const [activeMappings, setActiveMappings] = useState<ColumnMapping[] | null>(
    null,
  );
  const [supplierName, setSupplierName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateSaved, setIsTemplateSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const resetAnalysis = useCallback(() => {
    setAiMappings(null);
    setActiveMappings(null);
    setIsTemplateSaved(false);
    setIsSaving(false);
    setSaveMessage(null);
  }, []);

  const parseCsv = useCallback(
    (file: File) => {
      setParseError(null);
      setPayload(null);
      resetAnalysis();

      Papa.parse<string[]>(file, {
        preview: SAMPLE_ROW_COUNT + 1,
        skipEmptyLines: true,
        complete(results) {
          const rows = results.data;
          if (!rows.length) {
            setParseError("The CSV file appears to be empty.");
            return;
          }

          const headers = (rows[0] ?? []).map((header) =>
            String(header ?? "").trim(),
          );
          const sampleRows = rows
            .slice(1, SAMPLE_ROW_COUNT + 1)
            .map((row) => headers.map((_, index) => String(row[index] ?? "")));

          setPayload({
            fileName: file.name,
            headers,
            sampleRows,
          });
        },
        error(error) {
          setParseError(error.message);
        },
      });
    },
    [resetAnalysis],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) parseCsv(file);
    },
    [parseCsv],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { "text/csv": [".csv"] },
      multiple: false,
      maxFiles: 1,
      onDropRejected() {
        setPayload(null);
        resetAnalysis();
        setParseError("Only .csv files are accepted.");
      },
    });

  async function handleAnalyze() {
    if (!payload) return;

    setIsAnalyzing(true);
    setParseError(null);
    resetAnalysis();

    try {
      const result = await generateAiMapping(
        payload.headers,
        payload.sampleRows,
      );

      if (result.success) {
        setAiMappings(result.mappings);
        setActiveMappings(result.mappings.map((mapping) => ({ ...mapping })));
      } else {
        setParseError(result.error);
      }
    } catch {
      setParseError("AI mapping failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleMappingChange(
    index: number,
    mappedDbField: MappingFieldOption,
  ) {
    setActiveMappings((current) => {
      if (!current) return current;
      return current.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, mappedDbField } : mapping,
      );
    });
    setIsTemplateSaved(false);
    setSaveMessage(null);
  }

  function handleSupplierNameChange(value: string) {
    setSupplierName(value);
    setIsTemplateSaved(false);
    setSaveMessage(null);
  }

  async function handleSaveMappingTemplate() {
    const trimmedName = supplierName.trim();
    if (!trimmedName || !activeMappings || isSaving) return;

    setIsSaving(true);
    setParseError(null);

    try {
      const result = await saveMappingTemplate(trimmedName, activeMappings);

      if (result.success) {
        setIsTemplateSaved(true);
        setSaveMessage(`Template saved for ${trimmedName}`);
        router.push("/command-center");
        return;
      }

      setParseError(result.error);
    } catch {
      setParseError("Failed to save mapping template. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Supplier file upload</CardTitle>
          <CardDescription>
            Drop a CSV feed to extract a 3-row micro-payload for AI column
            mapping. The full file is never loaded into memory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              isDragActive && !isDragReject && "border-primary bg-primary/5",
              isDragReject && "border-destructive bg-destructive/5",
              !isDragActive && "border-border hover:border-primary/50",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">
              {isDragActive
                ? "Drop the CSV file here"
                : "Drag and drop a CSV file, or click to browse"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accepted type: .csv
            </p>
          </div>

          {payload ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <FileSpreadsheet data-icon="inline-start" />
                {payload.fileName}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {payload.headers.length} columns · previewing first{" "}
                {payload.sampleRows.length} rows
              </span>
            </div>
          ) : null}

          {parseError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {parseError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {payload && !activeMappings ? (
        <Card>
          <CardHeader>
            <CardTitle>Micro-payload preview</CardTitle>
            <CardDescription>
              Confirm the headers and sample rows before sending them to the AI
              mapper.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {payload.headers.map((header, index) => (
                    <TableHead key={`${header}-${index}`}>
                      {header || `Column ${index + 1}`}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.sampleRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {payload.headers.map((_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        {row[cellIndex] || "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              size="lg"
              disabled={!payload || isAnalyzing}
              onClick={handleAnalyze}
            >
              {isAnalyzing ? <Loader2 className="animate-spin" /> : null}
              {isAnalyzing ? "Analyzing…" : "Analyze Columns with AI"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {activeMappings ? (
        <Card>
          <CardHeader>
            <CardTitle>Proposed column mapping</CardTitle>
            <CardDescription>
              Review how each supplier header maps to a{" "}
              <code className="text-xs">masterCatalog</code> field before saving
              this template.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="supplier-name">Supplier Name</Label>
              <Input
                id="supplier-name"
                value={supplierName}
                onChange={(event) => handleSupplierNameChange(event.target.value)}
                placeholder="Apex, Vanguard"
                required
                autoComplete="off"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Required before you can save this mapping template.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier header</TableHead>
                  <TableHead className="w-10" />
                  <TableHead>Database field</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMappings.map((mapping, index) => {
                  const isOverridden =
                    mapping.mappedDbField !==
                    aiMappings?.[index]?.mappedDbField;

                  return (
                    <TableRow key={`${mapping.supplierHeader}-${index}`}>
                      <TableCell className="font-medium">
                        {mapping.supplierHeader}
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            items={MAPPING_FIELD_ITEMS}
                            value={mapping.mappedDbField}
                            onValueChange={(value) => {
                              if (value === null || !isMappingFieldOption(value)) {
                                return;
                              }
                              handleMappingChange(index, value);
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "min-w-44",
                                isOverridden &&
                                  "border-amber-500 text-amber-700 dark:text-amber-400",
                              )}
                              aria-label={`Map ${mapping.supplierHeader} to a database field`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MAPPING_FIELD_OPTIONS.map((field) => (
                                <SelectItem key={field} value={field}>
                                  {field}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isOverridden ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                              title="Manually overridden"
                            >
                              <Pencil className="size-3.5" />
                              <span>Edited</span>
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={confidenceVariant(mapping.confidence)}>
                          {mapping.confidence}%
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-muted-foreground">
                        {mapping.reasoning}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            {parseError ? (
              <p className="text-sm text-destructive" role="alert">
                {parseError}
              </p>
            ) : saveMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {saveMessage}
              </p>
            ) : (
              <span />
            )}
            <Button
              size="lg"
              disabled={
                !supplierName.trim() || isSaving || isTemplateSaved
              }
              onClick={handleSaveMappingTemplate}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" />
              ) : isTemplateSaved ? (
                <Check />
              ) : null}
              {isSaving
                ? "Saving…"
                : isTemplateSaved
                  ? "Mapping Template Saved"
                  : "Confirm & Save Mapping Template"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {!payload ? (
        <Button size="lg" disabled>
          Analyze Columns with AI
        </Button>
      ) : null}
    </div>
  );
}
