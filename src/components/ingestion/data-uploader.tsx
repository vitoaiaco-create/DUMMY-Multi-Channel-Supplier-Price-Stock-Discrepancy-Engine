"use client";

import { ArrowRight, Check, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
  generateAiMapping,
  type ColumnMapping,
} from "@/app/actions/ai-mapping";
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
  const [payload, setPayload] = useState<MicroPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping[] | null>(null);
  const [isTemplateSaved, setIsTemplateSaved] = useState(false);

  const resetAnalysis = useCallback(() => {
    setMappings(null);
    setIsTemplateSaved(false);
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
        setMappings(result.mappings);
      } else {
        setParseError(result.error);
      }
    } catch {
      setParseError("AI mapping failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
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

      {payload && !mappings ? (
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

      {mappings ? (
        <Card>
          <CardHeader>
            <CardTitle>Proposed column mapping</CardTitle>
            <CardDescription>
              Review how each supplier header maps to a{" "}
              <code className="text-xs">masterCatalog</code> field before saving
              this template.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                {mappings.map((mapping, index) => (
                  <TableRow key={`${mapping.supplierHeader}-${index}`}>
                    <TableCell className="font-medium">
                      {mapping.supplierHeader}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          mapping.mappedDbField === "ignore"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {mapping.mappedDbField}
                      </Badge>
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            {isTemplateSaved ? (
              <p className="text-sm text-muted-foreground" role="status">
                Mapping template saved for this session.
              </p>
            ) : (
              <span />
            )}
            <Button
              size="lg"
              disabled={isTemplateSaved}
              onClick={() => setIsTemplateSaved(true)}
            >
              {isTemplateSaved ? <Check /> : null}
              {isTemplateSaved
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
