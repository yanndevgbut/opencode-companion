import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function checkPack() {
  console.log("=== Checking Distribution Package for npm ===");

  const cliDir = path.join(rootDir, "packages/cli");
  const pkgJson = JSON.parse(await fsp.readFile(path.join(cliDir, "package.json"), "utf8"));

  console.log(`Package Name: ${pkgJson.name}`);
  console.log(`Version:      ${pkgJson.version}`);
  console.log(`Binaries:     ${JSON.stringify(pkgJson.bin)}`);

  if (pkgJson.name !== "opencode-companion") {
    throw new Error(`Package name must be 'opencode-companion', got '${pkgJson.name}'`);
  }

  // Run npm pack --dry-run --json
  const packOut = execSync("npm pack --dry-run --json", { cwd: cliDir, encoding: "utf8" });
  const packInfo = JSON.parse(packOut)[0];

  console.log(`Files count:  ${packInfo.entryCount}`);
  console.log(`Unpacked size: ${(packInfo.size / (1024 * 1024)).toFixed(2)} MB`);

  const files = packInfo.files.map((f) => f.path);
  const required = [
    "bin/opencode-companion.js",
    "dist/index.js",
    "dist/cli.js",
    "dist/ports.js",
    "package.json",
  ];

  for (const r of required) {
    if (!files.includes(r)) {
      throw new Error(`Missing required package file: ${r}`);
    }
  }

  console.log("\n✓ Package manifest & distribution checks passed!");
}

checkPack().catch((err) => {
  console.error("Pack check failed:", err.message);
  process.exit(1);
});
