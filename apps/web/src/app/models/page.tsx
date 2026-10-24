"use client";

import * as React from "react";
import {
  Cpu,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  Star,
  Image as ImageIcon,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

export default function ModelsPage() {
  const [models, setModels] = React.useState<any[]>([]);
  const [_defaults, setDefaults] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<string>("all");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingModel, setEditingModel] = React.useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingRef, setDeletingRef] = React.useState<{ providerId: string; modelId: string } | null>(null);

  // Form fields
  const [formProviderId, setFormProviderId] = React.useState("");
  const [formModelId, setFormModelId] = React.useState("");
  const [formName, setFormName] = React.useState("");
  const [formContext, setFormContext] = React.useState("128000");
  const [formOutput, setFormOutput] = React.useState("8192");
  const [formImageSupport, setFormImageSupport] = React.useState(true);
  const [formToolCall, setFormToolCall] = React.useState(true);
  const [formReasoning, setFormReasoning] = React.useState(false);

  const loadModels = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>("/api/models");
      setModels(data.models || []);
      setDefaults(data.defaults || {});
    } catch (err: any) {
      toast.error(err.message || "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadModels();
  }, [loadModels]);

  const providersList = Array.from(new Set(models.map((m) => m.providerId)));

  const openAdd = () => {
    setEditingModel(null);
    setFormProviderId(providersList[0] || "");
    setFormModelId("");
    setFormName("");
    setFormContext("128000");
    setFormOutput("8192");
    setFormImageSupport(true);
    setFormToolCall(true);
    setFormReasoning(false);
    setModalOpen(true);
  };

  const openEdit = (m: any) => {
    setEditingModel(m);
    setFormProviderId(m.providerId);
    setFormModelId(m.modelId);
    setFormName(m.name || "");
    setFormContext(String(m.limit?.context || 128000));
    setFormOutput(String(m.limit?.output || 8192));
    setFormImageSupport(Boolean(m.modalities?.input?.includes("image")));
    setFormToolCall(m.toolCall ?? true);
    setFormReasoning(Boolean(m.reasoning));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProviderId.trim() || !formModelId.trim()) {
      toast.error("Provider ID and Model ID are required");
      return;
    }

    const inputModalities = ["text"];
    if (formImageSupport) inputModalities.push("image");

    const payload = {
      providerId: formProviderId.trim(),
      modelId: formModelId.trim(),
      model: {
        name: formName.trim() || undefined,
        limit: {
          context: parseInt(formContext, 10) || 128000,
          output: parseInt(formOutput, 10) || 8192,
        },
        modalities: {
          input: inputModalities,
          output: ["text"],
        },
        tool_call: formToolCall,
        reasoning: formReasoning,
      },
    };

    try {
      await apiFetch("/api/models", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(editingModel ? "Updated model" : "Added model");
      setModalOpen(false);
      loadModels();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingRef) return;
    try {
      await apiFetch(
        `/api/models?providerId=${encodeURIComponent(deletingRef.providerId)}&modelId=${encodeURIComponent(deletingRef.modelId)}`,
        { method: "DELETE" }
      );
      toast.success(`Removed model ${deletingRef.providerId}/${deletingRef.modelId}`);
      setDeleteConfirmOpen(false);
      loadModels();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const setDefault = async (target: "model" | "small_model", refStr: string | null) => {
    try {
      await apiFetch("/api/models", {
        method: "PATCH",
        body: JSON.stringify({ target, value: refStr }),
      });
      toast.success(`Set ${target} to ${refStr ?? "none"}`);
      loadModels();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filtered = models.filter((m) => {
    const matchesProvider = providerFilter === "all" || m.providerId === providerFilter;
    const matchesSearch =
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      (m.name && m.name.toLowerCase().includes(search.toLowerCase())) ||
      m.providerId.toLowerCase().includes(search.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Model Manager</h2>
          <p className="text-xs text-slate-400">Configure models, context windows, modalities, and default selections.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4" />
            <span>Add Model</span>
          </Button>
          <Button variant="outline" size="sm" onClick={loadModels}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setProviderFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              providerFilter === "all" ? "bg-sky-500 text-slate-950 font-semibold" : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            All ({models.length})
          </button>
          {providersList.map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                providerFilter === p ? "bg-sky-500 text-slate-950 font-semibold" : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Cpu className="h-10 w-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No models found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add models configured under your providers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((m) => {
            const refStr = `${m.providerId}/${m.modelId}`;
            return (
              <Card key={refStr} className="flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-sm sm:text-base truncate block" title={m.name || m.modelId}>{m.name || m.modelId}</CardTitle>
                      </div>
                      <CardDescription className="text-xs font-mono text-slate-400 truncate block" title={refStr}>
                        {refStr}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {m.isDefault && <Badge variant="success">Default</Badge>}
                      {m.isSmall && <Badge variant="secondary">Small Model</Badge>}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  {/* Capabilities badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {m.modalities?.input?.includes("image") && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <ImageIcon className="h-3 w-3 text-sky-400" />
                        <span>Vision</span>
                      </Badge>
                    )}
                    {m.toolCall && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Wrench className="h-3 w-3 text-emerald-400" />
                        <span>Tool Calls</span>
                      </Badge>
                    )}
                    {m.reasoning && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3 text-purple-400" />
                        <span>Reasoning</span>
                      </Badge>
                    )}
                    {m.limit?.context && (
                      <Badge variant="outline">
                        {(m.limit.context / 1000).toFixed(0)}k context
                      </Badge>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={m.isDefault ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDefault("model", m.isDefault ? null : refStr)}
                      className="text-xs h-7 px-2"
                    >
                      <Star className="h-3 w-3 mr-1" />
                      {m.isDefault ? "Primary" : "Set Primary"}
                    </Button>
                    <Button
                      variant={m.isSmall ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setDefault("small_model", m.isSmall ? null : refStr)}
                      className="text-xs h-7 px-2"
                    >
                      {m.isSmall ? "Small ✓" : "Set Small"}
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(m)}
                      disabled={!m.editable}
                      className="h-7 w-7 text-slate-400 hover:text-white"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeletingRef({ providerId: m.providerId, modelId: m.modelId });
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={!m.editable}
                      className="h-7 w-7 text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingModel ? `Edit Model ${formModelId}` : "Add Model"}</DialogTitle>
              <DialogDescription>Define model limits, parameters, and modalities.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Provider ID *</label>
                <Input
                  disabled={Boolean(editingModel)}
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                  placeholder="e.g. 9router, openrouter"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Model ID *</label>
                <Input
                  disabled={Boolean(editingModel)}
                  value={formModelId}
                  onChange={(e) => setFormModelId(e.target.value)}
                  placeholder="e.g. gemini/gemini-3.7-flash, claude-3-5-sonnet"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Display Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Gemini 3.7 Flash"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Context Limit</label>
                  <Input
                    type="number"
                    value={formContext}
                    onChange={(e) => setFormContext(e.target.value)}
                    placeholder="128000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Max Output</label>
                  <Input
                    type="number"
                    value={formOutput}
                    onChange={(e) => setFormOutput(e.target.value)}
                    placeholder="8192"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formImageSupport}
                    onChange={(e) => setFormImageSupport(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span>Vision / Image input capability</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formToolCall}
                    onChange={(e) => setFormToolCall(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span>Tool / function calling support</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formReasoning}
                    onChange={(e) => setFormReasoning(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span>Reasoning / Thinking model</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingModel ? "Save Changes" : "Add Model"}
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
              <span>Confirm Delete Model</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove model{" "}
              <strong className="text-white">
                {deletingRef ? `${deletingRef.providerId}/${deletingRef.modelId}` : ""}
              </strong>
              ?
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
