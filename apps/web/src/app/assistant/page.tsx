"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Sparkles,
  GitCompare,
  RefreshCw,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

const PRESETS = [
  "Add provider 9router with OpenAI-compatible package and base URL https://9router-runner-production.up.railway.app/v1",
  "Add remote MCP server 'context7' at https://mcp.context7.com/mcp",
  "Set model '9router/uno/glm-5.3-flash-thinking:free' as default model",
  "Explain my current configuration and check for any potential errors",
];

export default function AssistantPage() {
  const [instruction, setInstruction] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [plan, setPlan] = React.useState<any>(null);
  const [notConfigured, setNotConfigured] = React.useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!instruction.trim() || loading) return;

    setLoading(true);
    setPlan(null);
    setNotConfigured(false);

    try {
      const data = await apiFetch<any>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setPlan(data);
    } catch (err: any) {
      if (err.message?.includes("not configured")) {
        setNotConfigured(true);
      }
      toast.error(err.message || "Failed to generate AI plan");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!plan || !plan.operations || plan.operations.length === 0) return;
    setApplying(true);
    try {
      await apiFetch("/api/assistant/apply", {
        method: "POST",
        body: JSON.stringify({ operations: plan.operations }),
      });
      toast.success("AI plan changes applied successfully (safety backup created)");
      setPlan(null);
      setInstruction("");
    } catch (err: any) {
      toast.error(err.message || "Failed to apply plan");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">AI Config Assistant</h2>
        <p className="text-xs text-slate-400">Describe what you want to change or configure using natural language.</p>
      </div>

      {/* Guide when AI is not configured */}
      {notConfigured && (
        <Card className="border-sky-500/40 bg-sky-950/20">
          <CardHeader>
            <div className="flex items-center gap-2 text-sky-400">
              <Bot className="h-5 w-5" />
              <CardTitle className="text-base">AI Provider Setup Required</CardTitle>
            </div>
            <CardDescription className="text-slate-300">
              The AI Config Assistant connects to your own preferred OpenAI-compatible provider (e.g. OpenAI, 9router, Groq, OpenRouter, or local Ollama).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-slate-400 space-y-2">
            <p>1. Go to Companion Settings to configure the AI endpoint and model name.</p>
            <p>2. No data is sent to external services unless you explicitly configure an AI provider.</p>
          </CardContent>
          <CardFooter>
            <Link href="/settings">
              <Button size="sm">
                <Settings className="h-4 w-4 mr-1" />
                Configure AI in Settings
              </Button>
            </Link>
          </CardFooter>
        </Card>
      )}

      {/* Instruction Form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Type your instruction (e.g. 'Add model gemini-3.7-flash to 9router with tool calls enabled')..."
                className="pr-10 text-sm h-12"
                disabled={loading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!instruction.trim() || loading}
                className="absolute right-1.5 top-1.5 h-9 w-9"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-slate-500">Quick suggestions:</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInstruction(p)}
                    className="text-[11px] text-slate-400 hover:text-sky-300 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1 text-left transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Plan Review Output */}
      {plan && (
        <Card className="border-sky-500/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-400" />
                <CardTitle className="text-base">AI Generated Proposal</CardTitle>
              </div>
              <Badge variant={plan.operations.length > 0 ? "warning" : "default"}>
                {plan.operations.length} Operation(s)
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-200 whitespace-pre-wrap leading-relaxed">
              {plan.answer}
            </div>

            {plan.changes && plan.changes.length > 0 && (
              <div className="space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <GitCompare className="h-4 w-4 text-sky-400" />
                  <span>Proposed Changes (Unified Diff)</span>
                </span>

                {plan.changes.map((chg: any, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-[#1e1e1e] p-3 font-mono text-[11px] overflow-x-auto text-slate-300 min-w-0">
                    <div className="text-slate-400 font-semibold mb-2 truncate" title={chg.path}>{chg.path}</div>
                    <pre className="whitespace-pre">{chg.unifiedDiff || "No textual diff"}</pre>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {plan.operations.length > 0 && (
            <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setPlan(null)}>
                Discard Plan
              </Button>
              <Button size="sm" onClick={handleApply} disabled={applying}>
                {applying ? "Applying & Backing up..." : "Approve & Apply Changes"}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}
