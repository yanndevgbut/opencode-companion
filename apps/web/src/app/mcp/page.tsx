"use client";

import * as React from "react";
import {
  Boxes,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  ShieldAlert,
  Play,
  Terminal,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

export default function McpPage() {
  const [servers, setServers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingServer, setEditingServer] = React.useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingName, setDeletingName] = React.useState<string | null>(null);

  // Testing & Confirmation
  const [testingName, setTestingName] = React.useState<string | null>(null);
  const [localConfirmOpen, setLocalConfirmOpen] = React.useState(false);
  const [pendingLocalTest, setPendingLocalTest] = React.useState<{ name: string; command: string[] } | null>(null);
  const [testResult, setTestResult] = React.useState<any>(null);

  // Form
  const [formName, setFormName] = React.useState("");
  const [formType, setFormType] = React.useState<"local" | "remote">("remote");
  const [formUrl, setFormUrl] = React.useState("");
  const [formCommand, setFormCommand] = React.useState("");
  const [formEnabled, setFormEnabled] = React.useState(true);

  const loadMcp = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>("/api/mcp");
      setServers(data.servers || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadMcp();
  }, [loadMcp]);

  const openAdd = () => {
    setEditingServer(null);
    setFormName("");
    setFormType("remote");
    setFormUrl("");
    setFormCommand("");
    setFormEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingServer(s);
    setFormName(s.name);
    setFormType(s.type === "local" ? "local" : "remote");
    setFormUrl(s.url || "");
    setFormCommand(Array.isArray(s.command) ? s.command.join(" ") : "");
    setFormEnabled(s.enabled);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Server name is required");
      return;
    }

    const config: any = {
      type: formType,
      enabled: formEnabled,
    };

    if (formType === "remote") {
      if (!formUrl.trim()) {
        toast.error("Remote server URL is required");
        return;
      }
      config.url = formUrl.trim();
    } else {
      if (!formCommand.trim()) {
        toast.error("Command line is required for local MCP server");
        return;
      }
      config.command = formCommand.trim().split(/\s+/);
    }

    try {
      await apiFetch("/api/mcp", {
        method: "POST",
        body: JSON.stringify({ name: formName.trim(), config }),
      });
      toast.success(editingServer ? `Updated MCP server ${formName}` : `Added MCP server ${formName}`);
      setModalOpen(false);
      loadMcp();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await apiFetch("/api/mcp", {
        method: "PATCH",
        body: JSON.stringify({ name, enabled }),
      });
      toast.success(`${enabled ? "Enabled" : "Disabled"} ${name}`);
      loadMcp();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingName) return;
    try {
      await apiFetch(`/api/mcp?name=${encodeURIComponent(deletingName)}`, {
        method: "DELETE",
      });
      toast.success(`Removed MCP server ${deletingName}`);
      setDeleteConfirmOpen(false);
      loadMcp();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async (s: any, confirmed = false) => {
    setTestingName(s.name);
    setTestResult(null);

    try {
      const res = await apiFetch<any>(`/api/mcp/${encodeURIComponent(s.name)}/test`, {
        method: "POST",
        body: JSON.stringify({ confirmLocalExecution: confirmed }),
      });

      if (res.confirmationRequired) {
        setPendingLocalTest({ name: s.name, command: res.command });
        setLocalConfirmOpen(true);
        setTestingName(null);
        return;
      }

      setTestResult({ name: s.name, ...res });
      if (res.ok) {
        toast.success(`MCP server ${s.name} connected: ${res.message}`);
      } else {
        toast.warning(`MCP test ${s.name}: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    } finally {
      setTestingName(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">MCP Server Manager</h2>
          <p className="text-xs text-slate-400">Manage Model Context Protocol tool integrations (remote & local).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4" />
            <span>Add MCP Server</span>
          </Button>
          <Button variant="outline" size="sm" onClick={loadMcp}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : servers.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Boxes className="h-10 w-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No MCP servers configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add Model Context Protocol integrations such as Context7, 21st, Sentry, or local tools.
            </p>
            <Button onClick={openAdd} size="sm" className="mt-2">
              <Plus className="h-4 w-4 mr-1" />
              Add MCP Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((s) => (
            <Card key={s.name} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
                      <span className="truncate">{s.name}</span>
                      <Badge variant={s.type === "local" ? "secondary" : "default"} className="text-[10px] shrink-0">
                        {s.type === "local" ? <Terminal className="h-3 w-3 mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
                        {s.type}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs font-mono truncate text-slate-400 block" title={s.type === "remote" ? s.url : (s.command || []).join(" ")}>
                      {s.type === "remote" ? s.url : (s.command || []).join(" ")}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(checked) => handleToggle(s.name, checked)}
                    disabled={!s.editable}
                    title={s.enabled ? "Disable server" : "Enable server"}
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-xs">
                {s.issues && s.issues.length > 0 && (
                  <div className="p-2 rounded bg-amber-950/30 border border-amber-800/80 text-amber-300 text-[11px] space-y-0.5">
                    {s.issues.map((iss: string, i: number) => (
                      <div key={i}>• {iss}</div>
                    ))}
                  </div>
                )}

                {testResult && testResult.name === s.name && (
                  <div className={`p-2 rounded text-[11px] border ${testResult.ok ? "bg-emerald-950/30 border-emerald-800 text-emerald-300" : "bg-red-950/30 border-red-800 text-red-300"}`}>
                    <div className="font-semibold">{testResult.ok ? "✓ Verified MCP Connection" : "✗ Connection Error"}</div>
                    <div>{testResult.message}</div>
                    {testResult.tools && testResult.tools.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-slate-800">
                        <span className="font-medium text-slate-300">Available Tools ({testResult.tools.length}):</span>{" "}
                        <span className="text-slate-400 font-mono">{testResult.tools.slice(0, 5).map((t: any) => t.name).join(", ")}{testResult.tools.length > 5 ? "..." : ""}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex items-center justify-between pt-3 border-t border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(s)}
                  disabled={testingName === s.name}
                  className="text-xs h-7 px-2"
                >
                  {testingName === s.name ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                  Test Server
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(s)}
                    disabled={!s.editable}
                    className="h-7 w-7 text-slate-400 hover:text-white"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeletingName(s.name);
                      setDeleteConfirmOpen(true);
                    }}
                    disabled={!s.editable}
                    className="h-7 w-7 text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingServer ? `Edit MCP ${formName}` : "Add MCP Server"}</DialogTitle>
              <DialogDescription>Configure a Model Context Protocol tool provider.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Server Name *</label>
                <Input
                  disabled={Boolean(editingServer)}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. context7, sentry, my_local_tool"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Transport Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType("remote")}
                    className={`p-2 rounded-lg border text-center transition-colors ${
                      formType === "remote" ? "border-sky-500 bg-sky-500/10 text-sky-300 font-semibold" : "border-slate-800 bg-slate-900 text-slate-400"
                    }`}
                  >
                    Remote (HTTP / SSE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType("local")}
                    className={`p-2 rounded-lg border text-center transition-colors ${
                      formType === "local" ? "border-sky-500 bg-sky-500/10 text-sky-300 font-semibold" : "border-slate-800 bg-slate-900 text-slate-400"
                    }`}
                  >
                    Local (Command / stdio)
                  </button>
                </div>
              </div>

              {formType === "remote" ? (
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Remote URL *</label>
                  <Input
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://mcp.context7.com/mcp"
                    required={formType === "remote"}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Command & Arguments *</label>
                  <Input
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="npx -y @modelcontextprotocol/server-everything"
                    required={formType === "local"}
                  />
                  <p className="text-[11px] text-slate-500">Command to execute in child process communicating over stdio.</p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Enabled on Startup</span>
                <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingServer ? "Save Changes" : "Add Server"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Local Command Execution Confirmation Dialog */}
      <Dialog open={localConfirmOpen} onOpenChange={setLocalConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              <span>Confirm Local Command Execution</span>
            </DialogTitle>
            <DialogDescription>
              Testing a local MCP server spawns a local process. Companion never runs commands automatically without confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded bg-slate-950 font-mono text-xs text-sky-300 border border-slate-800 break-all">
            {pendingLocalTest?.command.join(" ")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocalConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => {
                const s = servers.find((x) => x.name === pendingLocalTest?.name);
                setLocalConfirmOpen(false);
                if (s) handleTest(s, true);
              }}
            >
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>Confirm Delete MCP Server</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove MCP server <strong className="text-white">{deletingName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
