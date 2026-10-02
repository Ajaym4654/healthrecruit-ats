import { useState, useRef } from "react";
import { useImportCandidates, useListImportLogs, getListImportLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ParsedRow {
  [key: string]: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const importMutation = useImportCandidates();
  const { data: logs, isLoading: logsLoading } = useListImportLogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<null | { imported: number; skipped: number; duplicates: number; errors: string[] }>(null);

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    const text = await f.text();
    const rows = parseCSV(text);
    if (rows.length > 0) {
      setHeaders(Object.keys(rows[0]));
      setPreview(rows.slice(0, 5));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) {
      handleFile(f);
    } else {
      toast.error("Please upload a CSV file");
    }
  }

  async function handleImport() {
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast.error("No valid rows found");
      return;
    }

    setImporting(true);

    const BATCH_SIZE = 1000;
    let totalImported = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    const allErrors: string[] = [];

    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);

        setResult({
          imported: totalImported,
          skipped: totalSkipped,
          duplicates: totalDuplicates,
          errors: allErrors,
        });

        const data = await new Promise<any>((resolve, reject) => {
          importMutation.mutate(
            { data: { rows: batch as any, filename: file.name } },
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });

        totalImported += data.imported;
        totalSkipped += data.skipped;
        totalDuplicates += data.duplicates;
        allErrors.push(...data.errors);

        setResult({
          imported: totalImported,
          skipped: totalSkipped,
          duplicates: totalDuplicates,
          errors: allErrors,
        });
      }

      await queryClient.invalidateQueries({ queryKey: getListImportLogsQueryKey() });

      toast.success(`Imported ${totalImported} candidates`);
      setFile(null);
      setPreview([]);
      setHeaders([]);
    } catch (error: any) {
      toast.error(error?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Candidates</h1>
        <p className="text-muted-foreground">Upload a CSV file to import candidates in bulk.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>Supports CSV files. Columns are automatically mapped.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <Upload className="size-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a CSV file here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supported: CSV (Excel files require saving as CSV first)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
              <FileText className="size-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{preview.length > 0 ? `${preview.length}+ rows detected` : "Reading..."}</p>
              </div>
              <button onClick={() => { setFile(null); setPreview([]); setHeaders([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Preview (first 5 rows)</p>
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell key={h} className="text-xs max-w-32 truncate">{row[h]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Importing...</p>
              <Progress value={undefined} className="h-2 animate-pulse" />
            </div>
          )}

          {result && (
            <div className="p-4 rounded-lg border bg-muted/40 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="size-5 text-green-500" />
                <span className="font-medium text-sm">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Imported:</span> <strong>{result.imported}</strong></div>
                <div><span className="text-muted-foreground">Duplicates:</span> <strong>{result.duplicates}</strong></div>
                <div><span className="text-muted-foreground">Skipped:</span> <strong>{result.skipped}</strong></div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs text-destructive">{result.errors.slice(0, 3).join(", ")}</div>
              )}
            </div>
          )}

          <Button onClick={handleImport} disabled={!file || importing} className="w-full">
            <Upload className="size-4 mr-2" />
            {importing ? "Importing..." : `Import ${preview.length > 0 ? "Candidates" : "File"}`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No imports yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Duplicates</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm max-w-48 truncate">{log.filename}</TableCell>
                    <TableCell><Badge variant="secondary">{log.imported}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{log.duplicates}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{log.skipped}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(log.createdAt), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
