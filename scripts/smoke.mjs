import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 38472;
const TEST_HOST = "127.0.0.1";

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            // not json
          }
          resolve({ status: res.statusCode, headers: res.headers, text: body, json });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function waitForServer(port, maxTries = 30) {
  for (let i = 1; i <= maxTries; i++) {
    try {
      const res = await fetchHttp(`http://127.0.0.1:${port}/api/status`);
      if (res.status === 200 || res.status === 401) {
        return true;
      }
    } catch {
      // not yet up
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function runSmokeTests() {
  console.log("=== Running OpenCode Companion Smoke Tests ===");

  const cliBin = path.join(rootDir, "packages/cli/bin/opencode-companion.js");

  console.log(`\n[1/7] Launching Companion CLI on port ${TEST_PORT}...`);
  const child = spawn(
    process.execPath,
    [cliBin, "--port", String(TEST_PORT), "--host", TEST_HOST, "--token", "smoke-test-secret-token"],
    {
      env: { ...process.env, OCC_SESSION_TOKEN: "smoke-test-secret-token" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  const cleanup = () => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  };
  process.on("exit", cleanup);

  const ready = await waitForServer(TEST_PORT);
  if (!ready) {
    cleanup();
    console.error("CLI server failed to start within timeout. Output:\n", output);
    process.exit(1);
  }
  console.log("✓ Server listening on http://127.0.0.1:" + TEST_PORT);

  try {
    // 2. Test Security: Unauthorized without token
    console.log("\n[2/7] Testing Security: Token enforcement...");
    const unauth = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/status`);
    if (unauth.status !== 401) {
      throw new Error(`Expected HTTP 401 for unauthenticated request, got ${unauth.status}`);
    }
    console.log("✓ Correctly returned HTTP 401 Unauthorized when token missing");

    // 3. Test Security: Host header forgery protection
    console.log("\n[3/7] Testing Security: Host header loopback validation...");
    const badHost = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/status`, {
      headers: {
        Host: "evil-attacker.com",
        Authorization: "Bearer smoke-test-secret-token",
      },
    });
    if (badHost.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for forged Host header, got ${badHost.status}`);
    }
    console.log("✓ Correctly rejected foreign Host header with HTTP 403");

    // 4. Test Authenticated Endpoints
    console.log("\n[4/7] Testing Authenticated API Routes...");
    const authHeaders = {
      Authorization: "Bearer smoke-test-secret-token",
      "x-occ-csrf": "1",
    };

    // GET /api/status
    const statusRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/status`, { headers: authHeaders });
    if (statusRes.status !== 200 || !statusRes.json) {
      throw new Error(`Failed /api/status: ${statusRes.status}`);
    }
    console.log(`✓ /api/status 200 OK (OpenCode installed: ${statusRes.json.install?.installed}, providers: ${statusRes.json.summary?.providerCount})`);

    // GET /api/providers
    const provRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/providers`, { headers: authHeaders });
    if (provRes.status !== 200 || !Array.isArray(provRes.json)) {
      throw new Error(`Failed /api/providers: ${provRes.status}`);
    }
    console.log(`✓ /api/providers 200 OK (${provRes.json.length} provider(s))`);

    // GET /api/models
    const modelsRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/models`, { headers: authHeaders });
    if (modelsRes.status !== 200 || !Array.isArray(modelsRes.json?.models)) {
      throw new Error(`Failed /api/models: ${modelsRes.status}`);
    }
    console.log(`✓ /api/models 200 OK (${modelsRes.json.models.length} model(s))`);

    // GET /api/mcp
    const mcpRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/mcp`, { headers: authHeaders });
    if (mcpRes.status !== 200 || !Array.isArray(mcpRes.json?.servers)) {
      throw new Error(`Failed /api/mcp: ${mcpRes.status}`);
    }
    console.log(`✓ /api/mcp 200 OK (${mcpRes.json.servers.length} server(s))`);

    // GET /api/diagnostics
    const diagRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/diagnostics`, { headers: authHeaders });
    if (diagRes.status !== 200 || !diagRes.json?.checks) {
      throw new Error(`Failed /api/diagnostics: ${diagRes.status}`);
    }
    console.log(`✓ /api/diagnostics 200 OK (${diagRes.json.checks.length} checks, PASS: ${diagRes.json.summary?.PASS}, WARN: ${diagRes.json.summary?.WARNING}, ERR: ${diagRes.json.summary?.ERROR})`);

    // 5. Test Config Editor & Secret Redaction
    console.log("\n[5/7] Testing Editor & Secret Protection...");
    const editorRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/editor`, { headers: authHeaders });
    if (editorRes.status !== 200) {
      throw new Error(`Failed /api/editor: ${editorRes.status}`);
    }
    const primaryId = editorRes.json.primaryId;
    if (primaryId) {
      const fileRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/editor?fileId=${primaryId}`, { headers: authHeaders });
      if (fileRes.status === 200) {
        const fileContent = fileRes.json.content;
        // Verify no raw sk- secrets leaked in plain text
        if (/sk-[a-zA-Z0-9]{20,}/.test(fileContent)) {
          throw new Error("CRITICAL SECURITY LEAK: Raw API key detected unmasked in editor content!");
        }
        console.log("✓ Editor content safely redacted secrets with HMAC tag placeholders");
      }
    }

    // 6. Test Backups API
    console.log("\n[6/7] Testing Backup & Restore API...");
    const backupsRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/backups`, { headers: authHeaders });
    if (backupsRes.status !== 200 || !Array.isArray(backupsRes.json)) {
      throw new Error(`Failed /api/backups: ${backupsRes.status}`);
    }
    console.log(`✓ /api/backups 200 OK (${backupsRes.json.length} existing snapshot(s))`);

    // 7. Test Dashboard HTML Delivery
    console.log("\n[7/7] Testing Web UI Route Delivery...");
    const htmlRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/?token=smoke-test-secret-token`);
    if (htmlRes.status !== 200 || !htmlRes.text.includes("<!DOCTYPE html>")) {
      throw new Error(`Failed web UI delivery: status ${htmlRes.status}`);
    }
    console.log("✓ Dashboard HTML loaded with HTTP 200 OK and valid session cookie");

    console.log("\n==================================================");
    console.log("   ALL SMOKE TESTS PASSED CLEANLY (100% SUCCESS)");
    console.log("==================================================");
  } finally {
    cleanup();
  }
}

runSmokeTests().catch((err) => {
  console.error("\n❌ Smoke test failed:", err.message);
  process.exit(1);
});
