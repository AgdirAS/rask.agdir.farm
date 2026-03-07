"use client";

import { useState } from "react";

export default function DefinitionsPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/rabbitmq/definitions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `rabbitmq-definitions-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setImportError(null);
    setImportSuccess(false);
    try {
      const text = await file.text();
      const body: unknown = JSON.parse(text);
      const res = await fetch("/api/rabbitmq/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImportSuccess(true);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* export */}
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base">Export Definitions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Download a JSON snapshot of all vhosts, queues, exchanges, bindings, and policies. Use this for backup or migrating topology between brokers.
          </p>
        </div>
        {exportError && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{exportError}</p>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export Definitions"}
        </button>
      </div>

      {/* import */}
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base">Import Definitions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a previously exported definitions JSON file. Existing resources that match will be merged; new ones will be created. This will not delete resources not present in the file.
          </p>
        </div>
        {importError && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{importError}</p>
        )}
        {importSuccess && (
          <p className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 rounded-md px-3 py-2">
            ✓ Definitions imported successfully
          </p>
        )}
        <label className="block">
          <span className="sr-only">Choose definitions file</span>
          <div className={`relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-colors ${importing ? "opacity-50 pointer-events-none" : "hover:border-primary/60 hover:bg-muted/30"}`}>
            <svg className="w-8 h-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm text-muted-foreground">
              {importing ? "Importing…" : "Click to select a definitions .json file"}
            </span>
            <input
              type="file"
              accept=".json,application/json"
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                e.target.value = "";
              }}
            />
          </div>
        </label>
      </div>
    </div>
  );
}
