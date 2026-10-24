"use client";

import * as React from "react";
import { ShieldAlert, KeyRound, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveToken } from "@/lib/api-client";

export function AuthGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [tokenInput, setTokenInput] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;

    setChecking(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/status", {
        headers: {
          authorization: `Bearer ${token}`,
          "x-occ-csrf": "1",
        },
      });

      if (res.ok) {
        saveToken(token);
        onAuthenticated();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || `HTTP ${res.status}: Invalid token.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error checking token.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-3 sm:p-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/95 shadow-xl">
        <form onSubmit={handleSubmit}>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-800 text-slate-200 border border-slate-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <CardTitle className="text-base sm:text-lg font-bold text-white">OpenCode Companion</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Session token required to access local configuration
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="rounded-lg bg-slate-950 p-3 text-slate-300 border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-200 block">Where is my token?</span>
              <p className="text-slate-400">
                Check terminal where <code className="text-sky-300">opencode-companion</code> was launched. Copy the token from:
              </p>
              <p className="font-mono text-[11px] text-amber-300 break-all pt-0.5">
                http://127.0.0.1:3000/?token=&lt;token&gt;
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-slate-300">Session Token</label>
              <Input
                type="password"
                placeholder="Paste token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="text-xs font-mono h-10"
                autoFocus
                required
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-red-950/40 border border-red-800/80 p-2.5 text-red-300 text-[11px]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full h-10 text-xs" disabled={!tokenInput.trim() || checking}>
              <span>{checking ? "Verifying..." : "Authenticate & Unlock"}</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
