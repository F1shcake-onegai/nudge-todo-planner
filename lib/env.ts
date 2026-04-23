import { existsSync, readFileSync } from "node:fs";

/**
 * Read a config value from NAME env first, else from the file at NAME_FILE.
 * Supports the Docker secrets convention: secret files mounted at
 * /run/secrets/<name> with the path exposed via <NAME>_FILE env var.
 */
export function envOrFile(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.length > 0) return direct;
  const filePath = process.env[`${name}_FILE`];
  if (filePath && existsSync(filePath)) {
    try {
      const v = readFileSync(filePath, "utf8").trim();
      return v.length > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
