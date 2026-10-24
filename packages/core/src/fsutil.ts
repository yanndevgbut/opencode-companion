import fsp from "node:fs/promises";
import path from "node:path";

export async function atomicWriteText(file: string, text: string, mode = 0o600): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  const fh = await fsp.open(tmp, "wx", mode);
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync().catch(() => undefined);
  } finally {
    await fh.close();
  }
  try {
    await fsp.chmod(tmp, mode).catch(() => undefined);
    for (let i = 0; ; i++) {
      try {
        await fsp.rename(tmp, file);
        break;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (i < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
          await new Promise((r) => setTimeout(r, 40 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}
