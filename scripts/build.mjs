import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function run(cmd, cwd = rootDir) {
  console.log(`\n> ${cmd} (in ${path.relative(rootDir, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function copyDir(src, dest) {
  execSync(`mkdir -p "${dest}" && cp -r "${src}/." "${dest}/"`);
}

async function main() {
  console.log("=== Building OpenCode Companion ===");

  // 1. Build CLI dist
  console.log("\n[1/4] Building CLI bundle...");
  run("npx tsup packages/cli/src/index.ts packages/cli/src/cli.ts packages/cli/src/ports.ts packages/cli/src/browser.ts --format esm --dts --out-dir packages/cli/dist");

  // 2. Build Web app (Next.js standalone)
  console.log("\n[2/4] Building Web application (Next.js)...");
  run("npm run build", path.join(rootDir, "apps/web"));

  // 3. Package standalone artifacts into packages/cli/web
  console.log("\n[3/4] Packaging standalone artifacts into packages/cli/web...");
  const webDest = path.join(rootDir, "packages/cli/web");
  await fsp.rm(webDest, { recursive: true, force: true }).catch(() => undefined);

  const standaloneSrc = path.join(rootDir, "apps/web/.next/standalone");
  const staticSrc = path.join(rootDir, "apps/web/.next/static");
  const publicSrc = path.join(rootDir, "apps/web/public");

  // Copy standalone node_modules and server files
  await copyDir(standaloneSrc, webDest);

  // Copy static assets to web/apps/web/.next/static
  const targetStatic = path.join(webDest, "apps/web/.next/static");
  await copyDir(staticSrc, targetStatic);

  // Copy public assets if any
  try {
    const stat = await fsp.stat(publicSrc);
    if (stat.isDirectory()) {
      const targetPublic = path.join(webDest, "apps/web/public");
      await copyDir(publicSrc, targetPublic);
    }
  } catch {
    // public folder optional
  }

  console.log("\n[4/4] Verifying packaging output...");
  const serverJs = path.join(webDest, "apps/web/server.js");
  const stat = await fsp.stat(serverJs);
  console.log(`✓ Web server bundled: ${serverJs} (${stat.size} bytes)`);

  console.log("\n✓ OpenCode Companion build complete!");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
