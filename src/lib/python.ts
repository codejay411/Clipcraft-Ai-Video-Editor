import { spawnSync } from "child_process";

/**
 * Cross-platform Python interpreter resolution.
 * - honours PYTHON_BIN env var if set
 * - otherwise probes python3 -> python -> py (Windows launcher)
 * - caches the result for the process lifetime
 */
let cached: string | null = null;

export function pythonBin(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (cached) return cached;
  for (const bin of ["python3", "python", "py"]) {
    try {
      const probe = spawnSync(bin, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)"], {
        timeout: 8000,
        encoding: "utf8",
        windowsHide: true,
      });
      if (probe.status === 0) {
        cached = bin;
        return bin;
      }
    } catch {
      /* try next */
    }
  }
  // sensible default — caller will surface the error if python is missing
  cached = "python3";
  return cached;
}

export function pythonNotFoundError(): Error {
  return new Error(
    "Python 3.8+ not found. Install Python (https://python.org) and make sure `python3` or `python` is on your PATH, " +
      "then install the requirements: pip install -r requirements.txt"
  );
}
