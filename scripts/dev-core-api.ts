import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ScanFileResult = Map<string, number>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const coreDir = path.join(rootDir, "packages", "core");

const logEmoji = "⚡";

const IGNORE_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  ".git",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode",
]);

const SCAN_INTERVAL_MS = 1000;
const DEBOUNCE_MS = 300;

let apiProc: Bun.Subprocess | null = null;
let rebuildInProgress = false;
let rebuildQueued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: ScanFileResult | null = null;

function log(message: string) {
  console.log(`${logEmoji} ${message}`);
}

async function runCommand(cmd: string, args: string[]) {
  const proc = Bun.spawn({
    cmd: [cmd, ...args],
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exitCode = await proc.exited;
  return exitCode;
}

function startApi() {
  if (apiProc && apiProc.exitCode === null) {
    return;
  }

  log("Starting api dev server...");
  apiProc = Bun.spawn({
    cmd: ["bun", "run", "--filter=api", "dev"],
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  apiProc.exited.then((code) => {
    if (code !== 0) {
      log(`api exited with code ${code}`);
    } else {
      log("api exited");
    }
  });
}

async function stopApi() {
  if (!apiProc || apiProc.exitCode !== null) {
    return;
  }

  log("Stopping api dev server...");
  apiProc.kill();
  await apiProc.exited;
  apiProc = null;
}

async function buildCore() {
  log("Building @repo/core...");

  const code = await runCommand("bun", ["run", "--filter=@repo/core", "dev"]);

  if (code !== 0) {
    log(`Core build failed with exit code ${code}`);
    return false;
  }
  log("Core build completed.");

  return true;
}

async function scanFiles(dir: string): Promise<ScanFileResult> {
  const files = new Map<string, number>();
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries: Dirent<string>[];

    if (!current) {
      continue;
    }

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const name = entry.name;

      if (entry.isDirectory() && !IGNORE_DIRS.has(name)) {
        stack.push(path.join(current, name));
      } else if (entry.isFile()) {
        const filePath = path.join(current, name);

        try {
          const info = await stat(filePath);
          files.set(filePath, info.mtimeMs);
        } catch {
          // ignore files that disappear mid-scan
        }
      }
    }
  }

  return files;
}

function diffSnapshots(prev: ScanFileResult, next: ScanFileResult) {
  if (prev.size !== next.size) {
    return true;
  }

  for (const [file, mtime] of next) {
    const prevMtime = prev.get(file);
    if (prevMtime === undefined || prevMtime !== mtime) {
      return true;
    }
  }

  return false;
}

async function rebuildFlow() {
  if (rebuildInProgress) {
    rebuildQueued = true;
    return;
  }

  rebuildInProgress = true;
  rebuildQueued = false;

  await stopApi();

  const ok = await buildCore();
  lastSnapshot = await scanFiles(coreDir);
  if (ok) {
    startApi();
  } else {
    log("Core build failed; api will remain stopped until the next change.");
  }

  rebuildInProgress = false;
  if (rebuildQueued) {
    rebuildQueued = false;
    await rebuildFlow();
  }
}

async function init() {
  log("Initial core build...");
  const ok = await buildCore();

  if (ok) {
    startApi();
  } else {
    log("Initial core build failed; waiting for changes.");
  }

  lastSnapshot = await scanFiles(coreDir);

  setInterval(async () => {
    const nextSnapshot = await scanFiles(coreDir);
    if (!lastSnapshot) {
      lastSnapshot = nextSnapshot;
      return;
    }

    if (!diffSnapshots(lastSnapshot, nextSnapshot)) {
      return;
    }

    lastSnapshot = nextSnapshot;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      log("Detected change in @repo/core; rebuilding and restarting api...");
      rebuildFlow();
    }, DEBOUNCE_MS);
  }, SCAN_INTERVAL_MS);
}

process.on("SIGINT", async () => {
  log("Received SIGINT, shutting down...");
  await stopApi();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log("Received SIGTERM, shutting down...");
  await stopApi();
  process.exit(0);
});

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
