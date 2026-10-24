import { spawn } from "node:child_process";

export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  try {
    if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else {
      // Linux, Android Termux, BSD
      if (process.env.TERMUX_VERSION) {
        spawn("termux-open-url", [url], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }
    }
  } catch {
    // Ignore browser open failures
  }
}
