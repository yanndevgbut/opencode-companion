import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { BackupManager } from "../src/backup";

describe("backup & restore manager", () => {
  let tmpDir: string;
  let mgr: BackupManager;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "occ-backup-test-"));
    mgr = new BackupManager(tmpDir);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("creates, lists, reads and verifies backups", async () => {
    const content = JSON.stringify({ model: "test/model", autoupdate: true }, null, 2);
    const meta = await mgr.create({
      content,
      sourcePath: "/tmp/opencode.json",
      reason: "manual",
      name: "Test Snapshot",
    });

    expect(meta.id).toBeDefined();
    expect(meta.sha256).toBeDefined();

    const list = await mgr.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Test Snapshot");

    const read = await mgr.read(meta.id);
    expect(read.content).toBe(content);
    expect(read.meta.sha256).toBe(meta.sha256);
  });

  it("detects corrupted backup content", async () => {
    const meta = await mgr.create({
      content: '{"valid": true}',
      sourcePath: "/tmp/opencode.json",
      reason: "manual",
    });

    // Tamper with the file
    const targetFile = path.join(tmpDir, meta.id, meta.fileName);
    await fsp.writeFile(targetFile, '{"tampered": true}');

    await expect(mgr.read(meta.id)).rejects.toThrow("mismatch");
  });
});
