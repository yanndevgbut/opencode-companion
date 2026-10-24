"use client";

import * as React from "react";
import {
  Bot,
  FolderOpen,
  Save,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Form states
  const [configDirOverride, setConfigDirOverride] = React.useState("");
  const [projectDir, setProjectDir] = React.useState("");
  const [aiBaseURL, setAiBaseURL] = React.useState("");
  const [aiModel, setAiModel] = React.useState("");
  const [aiApiKey, setAiApiKey] = React.useState("");

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any>("/api/settings");
      setConfigDirOverride(data.configDirOverride || "");
      setProjectDir(data.projectDir || "");
      if (data.ai) {
        setAiBaseURL(data.ai.baseURL || "");
        setAiModel(data.ai.model || "");
        setAiApiKey(data.ai.apiKey || "");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload: any = {
      configDirOverride: configDirOverride.trim() || null,
      projectDir: projectDir.trim() || null,
      ai: aiBaseURL.trim() && aiModel.trim() ? {
        baseURL: aiBaseURL.trim(),
        model: aiModel.trim(),
        apiKey: aiApiKey.trim() || undefined,
      } : null,
    };

    try {
      await apiFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Settings saved successfully");
      loadSettings();
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-xs text-slate-400">Configure AI provider for the assistant and custom configuration path overrides.</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Assistant Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-sky-400" />
                <CardTitle className="text-base">AI Config Assistant Provider</CardTitle>
              </div>
              <CardDescription>
                Configure the LLM endpoint used by the natural-language assistant. Any OpenAI-compatible provider is supported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Provider Base URL</label>
                <Input
                  value={aiBaseURL}
                  onChange={(e) => setAiBaseURL(e.target.value)}
                  placeholder="https://9router-runner-production.up.railway.app/v1 or https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Model ID</label>
                <Input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="uno/glm-5.3-flash-thinking:free or gpt-4o-mini"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">API Key</label>
                <Input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="Leave blank for local servers, or paste API key"
                />
                <p className="text-[11px] text-slate-500">Stored in ~/.opencode-companion/settings.json (mode 0600).</p>
              </div>
            </CardContent>
          </Card>

          {/* Directory Overrides */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-purple-400" />
                <CardTitle className="text-base">Path Overrides</CardTitle>
              </div>
              <CardDescription>
                Optional custom directories if OpenCode does not use the default global path.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Config Directory Override</label>
                <Input
                  value={configDirOverride}
                  onChange={(e) => setConfigDirOverride(e.target.value)}
                  placeholder="Leave empty to use default ~/.config/opencode"
                />
                <p className="text-[11px] text-slate-500">Overrides global configuration discovery.</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Project Directory</label>
                <Input
                  value={projectDir}
                  onChange={(e) => setProjectDir(e.target.value)}
                  placeholder="Path to project containing local opencode.json"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              <span>{saving ? "Saving..." : "Save Settings"}</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
