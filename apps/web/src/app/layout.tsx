import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "OpenCode Companion",
  description: "Modern localhost dashboard for OpenCode configuration management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100">
        <AppShell>{children}</AppShell>
        <Toaster richColors position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
