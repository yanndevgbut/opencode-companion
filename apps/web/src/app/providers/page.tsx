"use client";

import * as React from "react";
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Shield,
  Search,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

export default function ProvidersPage() {
  const [providers, setProviders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<any>(null);

  // Form state
  const [formId, setFormId] = React.useState("");
  const [formName, setFormName] = React.useState("");
  const [formNpm, setFormNpm] = React.useState("@ai-sdk/openai-compatible");
  const [formBaseURL, setFormBaseURL] = React.useState("");
  const [formApiKey, setFormApiKey] = React.useState("");

  const loadProviders = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any[]>("/api/providers");
      setProviders(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const openAdd = () => {
    setEditingProvider(null);
    setFormId("");
    setFormName("");
    setFormNpm("@ai-sdk/openai-compatible");
    setFormBaseURL("");
    setFormApiKey("");
    setModalOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingProvider(p);
    setFormId(p.id);
    setFormName(p.name || "");
    setFormNpm(p.npm || "@ai-sdk/openai-compatible");
    setFormBaseURL(p.baseURL || "");
    setFormApiKey("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId.trim()) {
      toast.error("Provider ID is required");
      return;
    }

    const payload: any = {
      id: formId.trim(),
      provider: {
        name: formName.trim() || undefined,
        npm: formNpm.trim() || undefined,
        baseURL: formBaseURL.trim() || undefined,
      },
    };

    if (formApiKey.trim()) {
      payload.provider.apiKey = formApiKey.trim();
    }

    try {
      await apiFetch("/api/providers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(editingProvider ? `Updated provider ${formId}` : `Added provider ${formId}`);
      setModalOpen(false);
      loadProviders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await apiFetch(`/api/providers?id=${encodeURIComponent(deletingId)}`, {
        method: "DELETE",
      });
      toast.success(`Removed provider ${deletingId}`);
      setDeleteConfirmOpen(false);
      loadProviders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await apiFetch<any>(`/api/providers/${encodeURIComponent(id)}/test`, {
        method: "POST",
      });
      setTestResult({ id, ...res });
      if (res.ok) {
        toast.success(`Connection to ${id} verified: ${res.message}`);
      } else {
        toast.warning(`Connection test for ${id}: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const filtered = providers.filter(
    (p) =>
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.baseURL && p.baseURL.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Provider Manager</h2>
          <p className="text-xs text-slate-400">Configure LLM providers, credentials, and test connectivity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4" />
            <span>Add Provider</span>
          </Button>
          <Button variant="outline" size="sm" onClick={loadProviders} title="Reload">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Server className="h-10 w-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No providers configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add your first AI provider (like OpenAI, OpenRouter, 9router, Anthropic, or local Ollama) to start using models.
            </p>
            <Button onClick={openAdd} size="sm" className="mt-2">
              <Plus className="h-4 w-4 mr-1" />
              Add Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
                      <span className="truncate">{p.name || p.id}</span>
                      {p.name && <span className="text-xs text-slate-500 font-mono shrink-0">({p.id})</span>}
                    </CardTitle>
                    <CardDescription className="text-xs font-mono truncate text-slate-400 block" title={p.baseURL || "Standard SDK provider endpoint"}>
                      {p.baseURL || "Standard SDK provider endpoint"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]">{p.dialect}</Badge>
                    <Badge variant="default" className="text-[10px]">{p.modelCount} models</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-xs">
                {/* Credentials status */}
                <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-950/60 border border-slate-800 min-w-0">
                  <span className="text-slate-400 flex items-center gap-1.5 shrink-0 text-xs">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                    <span>API Key</span>
                  </span>
                  <span className="font-mono text-slate-300 truncate text-[11px]" title={p.apiKey.display}>
                    {p.apiKey.state === "none"
                      ? "None (public or local)"
                      : p.apiKey.display}
                  </span>
                </div>

                {/* Test status display if run */}
                {testResult && testResult.id === p.id && (
                  <div className={`p-2 rounded text-[11px] border ${testResult.ok ? "bg-emerald-950/30 border-emerald-800 text-emerald-300" : "bg-amber-950/30 border-amber-800 text-amber-300"}`}>
                    <div className="font-semibold">{testResult.ok ? "✓ Connectivity Verified" : "! Connectivity Warning"}</div>
                    <div>{testResult.message}</div>
                    {testResult.latencyMs && <div className="text-slate-400 mt-0.5">{testResult.latencyMs}ms response time</div>}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex items-center justify-between pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(p.id)}
                  disabled={testingId === p.id}
                  className="text-xs h-8"
                >
                  {testingId === p.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Test Endpoint"}
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
                    disabled={!p.editable}
                    title={p.editable ? "Edit provider" : "Read-only syntax or file"}
                    className="h-8 w-8 text-slate-400 hover:text-white"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeletingId(p.id);
                      setDeleteConfirmOpen(true);
                    }}
                    disabled={!p.editable}
                    title={p.editable ? "Delete provider" : "Read-only"}
                    className="h-8 w-8 text-slate-400 hover:text-red-400"
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
              <DialogTitle>{editingProvider ? `Edit Provider ${formId}` : "Add New Provider"}</DialogTitle>
              <DialogDescription>
                Configure provider base URL and credentials. API keys are stored locally and never exposed in plaintext.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Provider ID *</label>
                <Input
                  disabled={Boolean(editingProvider)}
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="e.g. 9router, openrouter, custom-ollama"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Display Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. 9Router AI Gateway"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Package / Adapter</label>
                <Input
                  value={formNpm}
                  onChange={(e) => setFormNpm(e.target.value)}
                  placeholder="@ai-sdk/openai-compatible"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Base URL</label>
                <Input
                  value={formBaseURL}
                  onChange={(e) => setFormBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
                <p className="text-[11px] text-slate-500">Supports &#123;env:MY_BASE_URL&#125; references.</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">API Key / Secret</label>
                <Input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={editingProvider ? "Leave blank to keep existing key" : "Paste secret or {env:API_KEY}"}
                />
                <p className="text-[11px] text-slate-500">
                  Write-only. Use &#123;env:VAR&#125; or &#123;file:~/.secrets/key&#125; to keep keys out of config files.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProvider ? "Save Changes" : "Add Provider"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>Confirm Delete Provider</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove provider <strong className="text-white">{deletingId}</strong>?
              An automatic backup will be created before removal.
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
