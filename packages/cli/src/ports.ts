import net from "node:net";

export function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(startPort: number, host = "127.0.0.1", maxTries = 50): Promise<number> {
  for (let p = startPort; p < startPort + maxTries; p++) {
    if (await isPortAvailable(p, host)) {
      return p;
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxTries - 1} on ${host}.`);
}
