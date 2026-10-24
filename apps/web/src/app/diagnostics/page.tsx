"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function DiagnosticsPage() {
  const [report, setReport] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const runReport = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>("/api/diagnostics");
      setReport(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    runReport();
  }, [runReport]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "PASS":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "WARNING":
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case "ERROR":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return null;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PASS":
        return <Badge variant="success">PASS</Badge>;
      case "WARNING":
        return <Badge variant="warning">WARNING</Badge>;
      case "ERROR":
        return <Badge variant="destructive">ERROR</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">System Diagnostics</h2>
          <p className="text-xs text-slate-400">Automated health checks for OpenCode installation, configuration, permissions, and network.</p>
        </div>

        <Button onClick={runReport} disabled={loading} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          <span>Re-run Diagnostics</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : !report ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-xs text-slate-500">Failed to load diagnostics report.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <Card className="border-emerald-950/40 bg-emerald-950/10">
              <CardContent className="p-3 sm:p-4 text-center">
                <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">{report.summary.PASS}</span>
                <span className="text-[11px] sm:text-xs text-slate-400 block mt-0.5">Passed</span>
              </CardContent>
            </Card>

            <Card className="border-amber-950/40 bg-amber-950/10">
              <CardContent className="p-3 sm:p-4 text-center">
                <span className="text-xl sm:text-2xl font-bold font-mono text-amber-400">{report.summary.WARNING}</span>
                <span className="text-[11px] sm:text-xs text-slate-400 block mt-0.5">Warnings</span>
              </CardContent>
            </Card>

            <Card className="border-red-950/40 bg-red-950/10">
              <CardContent className="p-3 sm:p-4 text-center">
                <span className="text-xl sm:text-2xl font-bold font-mono text-red-400">{report.summary.ERROR}</span>
                <span className="text-[11px] sm:text-xs text-slate-400 block mt-0.5">Errors</span>
              </CardContent>
            </Card>
          </div>

          {/* Detailed checks list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm sm:text-base">Diagnostic Checks ({report.checks.length})</CardTitle>
              <CardDescription>Generated at {formatDate(report.at)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.checks.map((chk: any) => (
                <div
                  key={chk.id}
                  className="p-3 rounded border border-slate-800 bg-slate-950/40 space-y-2 text-xs min-w-0"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-200 min-w-0 flex-1">
                      {statusIcon(chk.status)}
                      <span className="truncate">{chk.title}</span>
                      <span className="text-[11px] text-slate-500 font-normal shrink-0">({chk.group})</span>
                    </div>
                    <div className="shrink-0">{statusBadge(chk.status)}</div>
                  </div>

                  <p className="text-slate-300">{chk.detail}</p>

                  {(chk.cause || chk.fix) && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                      {chk.cause && (
                        <div className="text-slate-400">
                          <strong className="text-slate-300">Cause:</strong> {chk.cause}
                        </div>
                      )}
                      {chk.fix && (
                        <div className="text-sky-400 flex items-start gap-1">
                          <Wrench className="h-3 w-3 shrink-0 mt-0.5" />
                          <span><strong>Fix:</strong> {chk.fix}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
