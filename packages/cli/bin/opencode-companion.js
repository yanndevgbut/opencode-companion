#!/usr/bin/env node

const nodeVersion = process.versions.node.split(".").map(Number);
if (nodeVersion[0] < 20 || (nodeVersion[0] === 20 && nodeVersion[1] < 9)) {
  console.error(`Error: OpenCode Companion requires Node.js >= 20.9.0 (current: ${process.version}).`);
  process.exit(1);
}

import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { parseArgs, printHelp } from "../dist/cli.js";
import { findAvailablePort } from "../dist/ports.js";
import { openBrowser } from "../dist/browser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));

const { opts, showHelp, showVersion } = parseArgs(process.argv.slice(2));

if (showHelp) {
  printHelp();
  process.exit(0);
}

if (showVersion) {
  console.log(`opencode-companion v${pkg.version}`);
  process.exit(0);
}

async function start() {
  const chosenPort = await findAvailablePort(opts.port, opts.host);
  if (chosenPort !== opts.port) {
    console.log(`Port ${opts.port} is already in use. Switched to next available port: ${chosenPort}`);
  }

  let dashboardUrl = `http://${opts.host}:${chosenPort}/`;

  if (opts.noAuth) {
    process.env.OCC_NO_AUTH = "1";
  } else {
    const sessionToken = opts.token || process.env.OCC_SESSION_TOKEN || randomBytes(24).toString("hex");
    process.env.OCC_SESSION_TOKEN = sessionToken;
    dashboardUrl = `http://${opts.host}:${chosenPort}/?token=${sessionToken}`;
  }

  process.env.PORT = String(chosenPort);
  process.env.HOSTNAME = opts.host;
  if (opts.configDir) process.env.OPENCODE_CONFIG_DIR = opts.configDir;
  if (opts.projectDir) process.env.OCC_PROJECT_DIR = opts.projectDir;

  console.log(`
==================================================
  OpenCode Companion v${pkg.version}
  Dashboard: ${dashboardUrl}
==================================================
* Running on 127.0.0.1 (Local device only)
* Preserving privacy: credentials remain local
${opts.noAuth ? "* Token authentication: DISABLED (--no-auth)\n" : ""}* Press Ctrl+C to stop
`);

  // Path to the Next.js standalone server
  const standaloneServerPaths = [
    path.join(__dirname, "../web/apps/web/server.js"),
    path.join(__dirname, "../web/server.js"),
  ];
  const standaloneServer = standaloneServerPaths.find((p) => fs.existsSync(p));
  const localWebDir = path.join(__dirname, "../../apps/web");

  let serverProcess;

  if (standaloneServer) {
    // Packaged standalone mode
    const { spawn } = await import("node:child_process");
    serverProcess = spawn(process.execPath, [standaloneServer], {
      env: { ...process.env, PORT: String(chosenPort), HOSTNAME: opts.host },
      stdio: "inherit",
    });
  } else {
    // Development or monorepo workspace mode
    const { spawn } = await import("node:child_process");
    const nextBin = path.join(localWebDir, "node_modules/.bin/next");
    const args = fs.existsSync(nextBin)
      ? [nextBin, "start", "-p", String(chosenPort), "-H", opts.host, localWebDir]
      : ["npx", "next", "start", "-p", String(chosenPort), "-H", opts.host, localWebDir];

    serverProcess = spawn(args[0], args.slice(1), {
      env: { ...process.env },
      stdio: "inherit",
    });
  }

  const cleanup = () => {
    console.log("\nShutting down OpenCode Companion...");
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      setTimeout(() => serverProcess.kill("SIGKILL"), 2000).unref();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  serverProcess.on("exit", (code) => {
    process.exit(code || 0);
  });

  if (opts.open) {
    setTimeout(() => {
      openBrowser(dashboardUrl);
    }, 1200);
  }
}

start().catch((err) => {
  console.error("Failed to start OpenCode Companion:", err.message);
  process.exit(1);
});
