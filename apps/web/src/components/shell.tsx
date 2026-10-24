"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Cpu,
  Boxes,
  FileCode,
  Archive,
  Activity,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/models", label: "Models", icon: Cpu },
  { href: "/mcp", label: "MCP Servers", icon: Boxes },
  { href: "/editor", label: "Config Editor", icon: FileCode },
  { href: "/backups", label: "Backup & Restore", icon: Archive },
  { href: "/diagnostics", label: "Diagnostics", icon: Activity },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [status, setStatus] = React.useState<any>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      const data = await apiFetch<any>("/api/status");
      setStatus(data);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Close mobile drawer on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const activeNavItem = NAV_ITEMS.find(
    (n) => n.href === pathname || (n.href !== "/" && pathname?.startsWith(n.href))
  );

  const renderNavItems = (isMobile: boolean = false) => (
    <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => isMobile && setMobileOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
              active
                ? "bg-slate-800 text-slate-100 border-l-2 border-sky-400 pl-2 font-semibold"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            )}
            title={collapsed && !isMobile ? item.label : undefined}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-sky-400" : "text-slate-500")} />
            {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Content */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 border-r border-slate-800 shadow-2xl transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-sky-400 border border-slate-700">
              <Boxes className="h-4 w-4" />
            </span>
            <span>OpenCode</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
              Companion
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {renderNavItems(true)}

        {status && (
          <div className="p-3 m-2 rounded bg-slate-950 border border-slate-800 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Runtime</span>
              <span className={cn("text-[10px] font-mono px-1.5 py-0.2 rounded", status.install?.installed ? "text-emerald-400 bg-emerald-950/60" : "text-amber-400 bg-amber-950/60")}>
                {status.install?.installed ? `v${status.install.version || "ok"}` : "missing"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 truncate" title={status.primaryPath || "No active config"}>
              {status.primaryPath ? status.primaryPath.split(/[\\/]/).pop() : "No config"}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-slate-800/80 bg-slate-900/90 transition-all duration-200 z-30 shrink-0",
          collapsed ? "w-14" : "w-60"
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-slate-800/80">
          {!collapsed ? (
            <Link href="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight text-white min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-sky-400 border border-slate-700 shrink-0">
                <Boxes className="h-4 w-4" />
              </span>
              <span className="truncate">OpenCode</span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 py-0.2 rounded shrink-0">
                Companion
              </span>
            </Link>
          ) : (
            <Link href="/" className="mx-auto flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-sky-400 border border-slate-700">
              <Boxes className="h-4 w-4" />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-white rounded p-1 hover:bg-slate-800 transition-colors shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Navigation items */}
        {renderNavItems(false)}

        {/* Status pill in bottom sidebar */}
        {!collapsed && status && (
          <div className="p-2.5 m-2 rounded bg-slate-950/80 border border-slate-800/90 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px] font-medium">OpenCode</span>
              <span className={cn("text-[10px] font-mono px-1 rounded", status.install?.installed ? "text-emerald-400 bg-emerald-950/60" : "text-amber-400 bg-amber-950/60")}>
                {status.install?.installed ? `v${status.install.version || "detected"}` : "missing"}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate" title={status.primaryPath || "No active config"}>
              {status.primaryPath ? status.primaryPath.split(/[\\/]/).pop() : "No config"}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-3 sm:px-6 backdrop-blur shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 -ml-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 md:hidden shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm sm:text-base font-semibold text-slate-100 truncate">
              {activeNavItem?.label || "Companion"}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden xs:inline">127.0.0.1</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStatus()}
              title="Refresh status"
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline ml-1 text-[11px]">Sync</span>
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 min-w-0">
          <div className="mx-auto max-w-6xl space-y-5 min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
