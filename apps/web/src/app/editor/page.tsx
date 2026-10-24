"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  FileCode,
  Save,
  RefreshCw,
  GitCompare,
  Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), { ssr: false });
const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false });

export default function ConfigEditorPage() {
  const [files, setFiles] = React.useState<any[]>([]);
  const [activeFileId, setActiveFileId] = React.useState<string | null>(null);
  const [fileMeta, setFileMeta] = React.useState<any>(null);
  const [content, setContent] = React.useState("");
  const [originalContent, setOriginalContent] = React.useState("");
  const [originalHash, setOriginalHash] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [diffOpen, setDiffOpen] = React.useState(false);

  const loadFileList = React.useCallback(async () => {
    try {
      const data = await apiFetch<any>("/api/editor");
      setFiles(data.files || []);
      if (!activeFileId && data.primaryId) {
        setActiveFileId(data.primaryId);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load files list");
    }
  }, [activeFileId]);

  const loadFileContent = React.useCallback(async (fileId: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<any>(`/api/editor?fileId=${encodeURIComponent(fileId)}`);
      setFileMeta(data.file);
      setContent(data.content);
      setOriginalContent(data.content);
      setOriginalHash(data.originalHash);
    } catch (err: any) {
      toast.error(err.message || "Failed to load file content");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadFileList();
  }, [loadFileList]);

  React.useEffect(() => {
    if (activeFileId) {
      loadFileContent(activeFileId);
    }
  }, [activeFileId, loadFileContent]);

  const handleSave = async () => {
    if (!activeFileId) return;
    setSaving(true);
    try {
      const res = await apiFetch<any>("/api/editor", {
        method: "POST",
        body: JSON.stringify({
          fileId: activeFileId,
          content,
          expectedHash: originalHash,
        }),
      });
      toast.success("Configuration saved successfully (auto-backup created)");
      setOriginalContent(content);
      setOriginalHash(res.hash);
      setDiffOpen(false);
      loadFileList();
    } catch (err: any) {
      toast.error(err.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const isDirty = content !== originalContent;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Config Editor</h2>
          <p className="text-xs text-slate-400">Directly inspect and modify configuration files with syntax validation and secret protection.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDiffOpen(true)}
            disabled={!isDirty}
          >
            <GitCompare className="h-4 w-4" />
            <span>Review Diff</span>
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving || !fileMeta?.writable}
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Saving..." : "Save Changes"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => activeFileId && loadFileContent(activeFileId)}
            title="Reload from disk"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* File selector tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {files.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFileId(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 border transition-colors ${
              activeFileId === f.id
                ? "bg-sky-500/10 border-sky-500/40 text-sky-300 font-semibold"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>{f.path.split(/[\\/]/).pop()}</span>
            {!f.writable && <span title="Read-only"><Lock className="h-3 w-3 text-amber-400" /></span>}
            {activeFileId === f.id && isDirty && <span className="h-2 w-2 rounded-full bg-amber-400" title="Modified" />}
          </button>
        ))}
      </div>

      {/* Editor Card */}
      <Card className="overflow-hidden border-slate-800">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/60 text-xs min-w-0">
          <span className="font-mono text-slate-400 truncate flex-1 min-w-0" title={fileMeta?.path}>{fileMeta?.path}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!fileMeta?.writable && <Badge variant="warning" className="text-[10px]">Read-Only</Badge>}
            <Badge variant="outline" className="text-[10px]">{fileMeta?.role}</Badge>
            {isDirty && <Badge variant="warning" className="text-[10px]">Unsaved</Badge>}
          </div>
        </div>

        <div className="h-[420px] sm:h-[520px] w-full bg-[#1e1e1e]">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
            </div>
          ) : (
            <Editor
              height="100%"
              defaultLanguage="json"
              theme="vs-dark"
              value={content}
              onChange={(val) => setContent(val || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                formatOnPaste: true,
                formatOnType: true,
                automaticLayout: true,
                readOnly: !fileMeta?.writable,
                scrollBeyondLastLine: false,
              }}
            />
          )}
        </div>
      </Card>

      {/* Diff Review Dialog */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-sky-400" />
              <span>Review Changes (Before / After)</span>
            </DialogTitle>
            <DialogDescription>
              Confirm modifications before committing to disk. Secrets are preserved securely.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 h-[420px] w-full border border-slate-800 rounded-lg overflow-hidden my-2">
            <DiffEditor
              height="100%"
              original={originalContent}
              modified={content}
              language="json"
              theme="vs-dark"
              options={{
                readOnly: true,
                automaticLayout: true,
                fontSize: 12,
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffOpen(false)}>
              Keep Editing
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
