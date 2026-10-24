"use client";

import * as React from "react";
import Link from "next/link";
import {
  Server,
  Cpu,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  ArrowRight,
  Terminal,
  Activity,
  XCircle,
  RefreshCw,
  Bot,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { AuthGate } from "@/components/auth-gate";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>("/api/status");
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard status.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    if (error && (error.includes("Unauthorized") || error.includes("401"))) {
      return <AuthGate onAuthenticated={loadData} />;
    }
    return (
      <Card className="border-red-900/50 bg-red-950/20">
        <CardHeader>
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="h-5 w-5" />
            <CardTitle>Error Loading Dashboard</CardTitle>
          </div>
          <CardDescription className="text-red-300">{error}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={loadData}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { install, primaryPath, summary, files, issues: _issues, recentActivity } = data;

  return (
    <div className="space-y-5 min-w-0">
      {/* OpenCode Not Installed or Not Found Warning Banner */}
      {!install?.installed && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>OpenCode Executable Not Detected</span>
          </div>
          <p className="text-slate-300">
            {install?.problem || "OpenCode binary was not found in PATH or via OPENCODE_BIN."}
          </p>
          <div className="pt-1 text-slate-400 space-y-1">
            <p>• Install globally: <code className="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-amber-200">npm i -g opencode</code></p>
            <p>• Or set custom binary path in Settings: <code className="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-amber-200">OPENCODE_BIN=/path/to/opencode</code></p>
          </div>
        </div>
      )}

      {/* Main Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Providers Stat */}
        <Card className="hover:border-slate-700 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">Providers</CardTitle>
            <Server className="h-3.5 w-3.5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">{summary.providerCount}</div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">Configured LLMs</p>
          </CardContent>
        </Card>

        {/* Models Stat */}
        <Card className="hover:border-slate-700 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">Models</CardTitle>
            <Cpu className="h-3.5 w-3.5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">{summary.modelCount}</div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">Catalog & overrides</p>
          </CardContent>
        </Card>

        {/* MCP Stat */}
        <Card className="hover:border-slate-700 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">MCP Servers</CardTitle>
            <Boxes className="h-3.5 w-3.5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">{summary.mcpCount}</div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">Tools & integrations</p>
          </CardContent>
        </Card>

        {/* Validation Stat */}
        <Card className="hover:border-slate-700 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">Validation</CardTitle>
            {summary.hasIssues ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
                {summary.hasIssues ? summary.issueCount : "OK"}
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${summary.hasIssues ? "bg-amber-950/60 text-amber-400 border border-amber-800/60" : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"}`}>
                {summary.hasIssues ? "Issue" : "Valid"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {summary.hasIssues ? "Needs review" : "Schema compliant"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Overview Section */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-800/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="h-4 w-4 text-sky-400 shrink-0" />
              <CardTitle className="text-sm font-semibold truncate">Runtime Environment</CardTitle>
            </div>
            <span className="text-[11px] font-mono text-slate-500 shrink-0">
              {files.length} config source{files.length === 1 ? "" : "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded bg-slate-950/80 border border-slate-800/80 space-y-1.5 min-w-0">
              <span className="text-slate-400 font-medium text-[11px] block">Binary Executable</span>
              <div className="font-mono text-slate-200 text-xs break-all" title={install?.binPath || "Not found"}>
                {install?.binPath || "Not found in PATH"}
              </div>
              <div className="pt-0.5 flex flex-wrap gap-1.5">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${install?.installed ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-red-950/60 text-red-300 border border-red-800/60"}`}>
                  {install?.version ? `v${install.version}` : install?.installed ? "detected" : "missing"}
                </span>
                {install?.source && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {install.source}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded bg-slate-950/80 border border-slate-800/80 space-y-1.5 min-w-0">
              <span className="text-slate-400 font-medium text-[11px] block">Primary Active Config</span>
              <div className="font-mono text-slate-200 text-xs break-all" title={primaryPath || "None"}>
                {primaryPath || "No active config found"}
              </div>
              <div className="pt-0.5">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/60">
                  Active Target
                </span>
              </div>
            </div>
          </div>

          {/* Files List */}
          <div className="space-y-2 min-w-0">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>Config Precedence Hierarchy</span>
            </span>
            <div className="rounded border border-slate-800/80 overflow-hidden divide-y divide-slate-800/80">
              {files.map((f: any) => (
                <div
                  key={f.id}
                  className="p-2.5 flex items-center justify-between gap-3 text-xs bg-slate-950/40 hover:bg-slate-900/40 transition-colors min-w-0"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="font-mono text-slate-200 block truncate" title={f.path}>
                      {f.path}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate">
                      {f.exists ? `${f.size} bytes • ${f.writable ? "Writable" : "Read-only"}` : "Not created"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {f.role}
                    </span>
                    {f.exists && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${f.parseOk ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400"}`}>
                        {f.parseOk ? "valid" : "syntax error"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/providers" className="block group min-w-0">
          <div className="h-full p-4 rounded-lg border border-slate-800/90 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <Server className="h-4 w-4 text-sky-400" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
            </div>
            <div className="text-sm font-semibold text-slate-100">Providers</div>
            <p className="text-xs text-slate-400">Configure LLM endpoints, credentials, and test connectivity.</p>
          </div>
        </Link>

        <Link href="/mcp" className="block group min-w-0">
          <div className="h-full p-4 rounded-lg border border-slate-800/90 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <Boxes className="h-4 w-4 text-purple-400" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
            </div>
            <div className="text-sm font-semibold text-slate-100">MCP Servers</div>
            <p className="text-xs text-slate-400">Manage local stdio and remote MCP server integrations.</p>
          </div>
        </Link>

        <Link href="/assistant" className="block group min-w-0">
          <div className="h-full p-4 rounded-lg border border-slate-800/90 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <Bot className="h-4 w-4 text-emerald-400" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
            </div>
            <div className="text-sm font-semibold text-slate-100">AI Config Assistant</div>
            <p className="text-xs text-slate-400">Natural language config changes with diff inspection and validation.</p>
          </div>
        </Link>
      </div>

      {/* Recent Activity Card */}
      {recentActivity && recentActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2.5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>Recent Activity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-800/60 text-xs">
              {recentActivity.map((act: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-2 gap-3 min-w-0">
                  <span className="text-slate-300 font-mono truncate">{act.summary}</span>
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">{formatDate(act.ts)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
