"use client";

import * as React from "react";
import {
  Archive,
  RotateCcw,
  Trash2,
  Plus,
  RefreshCw,
  FileCheck,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatBytes } from "@/lib/utils";
import { toast } from "sonner";

export default function BackupsPage() {
  const [backups, setBackups] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [manualName, setManualName] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [inspectData, setInspectData] = React.useState<any>(null);
  const [inspectOpen, setInspectOpen] = React.useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = React.useState(false);
  const [restoringBackup, setRestoringBackup] = React.useState<any>(null);

  const loadBackups = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any[]>("/api/backups");
      setBackups(data || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/backups", {
        method: "POST",
        body: JSON.stringify({ name: manualName.trim() || undefined }),
      });
      toast.success("Created manual backup");
      setCreateOpen(false);
      setManualName("");
      loadBackups();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleInspect = async (id: string) => {
    try {
      const data = await apiFetch<any>(`/api/backups/${encodeURIComponent(id)}`);
      setInspectData(data);
      setInspectOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRestore = async () => {
    if (!restoringBackup) return;
    try {
      await apiFetch(`/api/backups/${encodeURIComponent(restoringBackup.id)}/restore`, {
        method: "POST",
      });
      toast.success(`Restored backup "${restoringBackup.name}" successfully!`);
      setRestoreConfirmOpen(false);
      loadBackups();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/backups/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      toast.success("Backup deleted");
      loadBackups();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Backup & Restore</h2>
          <p className="text-xs text-slate-400">Local version snapshots created automatically before changes and manually on demand.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            <span>Create Backup</span>
          </Button>
          <Button variant="outline" size="sm" onClick={loadBackups}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : backups.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Archive className="h-10 w-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No backups available yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Companion automatically generates snapshots before every change to providers, models, or MCP servers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {backups.map((b) => (
            <Card key={b.id} className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm text-slate-100 truncate">{b.name}</span>
                  <Badge variant={b.reason === "manual" ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {b.reason}
                  </Badge>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 min-w-0">
                  <span className="shrink-0">{formatDate(b.createdAt)}</span>
                  <span>•</span>
                  <span className="shrink-0">{formatBytes(b.size)}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-slate-500 truncate block max-w-full" title={b.sourcePath}>{b.sourcePath}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => handleInspect(b.id)} className="h-8 px-2.5 text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRestoringBackup(b);
                    setRestoreConfirmOpen(true);
                  }}
                  className="h-8 px-2.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(b.id)}
                  className="h-8 w-8 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Manual Backup Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create Manual Backup</DialogTitle>
              <DialogDescription>Snapshot the current configuration state to local backup storage.</DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-2 text-xs">
              <label className="text-slate-300 font-medium">Backup Label / Note</label>
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Before testing custom Ollama configuration"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Snapshot</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inspect Backup Dialog */}
      <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-sky-400" />
              <span>{inspectData?.meta?.name}</span>
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              SHA256: {inspectData?.meta?.sha256}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 max-h-[400px]">
            <pre>{inspectData?.content}</pre>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <span>Confirm Configuration Restore</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to restore backup <strong className="text-white">{restoringBackup?.name}</strong>?
              A safety backup of the current state will be created immediately before restoring.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleRestore}>
              Confirm Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
