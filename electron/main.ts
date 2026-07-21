import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";

const execFileAsync = promisify(execFile);
const PRODUCT_NAME = "Rosetta";
const RUNNER_IMAGE = "rosetta-python:0.1";
const allowedExternalProtocols = new Set(["https:", "mailto:"]);

interface DesktopApiModule {
  handleNotebookApiRequest: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<boolean>;
}

interface LocalServer {
  origin: string;
  server: Server;
}

function desktopRoot(): string {
  const candidate = app.getAppPath();
  return existsSync(join(candidate, "dist", "index.html")) ? candidate : resolve(__dirname, "..");
}

function rendererRoot(): string {
  return join(desktopRoot(), "dist");
}

function runtimeRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, "app-runtime") : desktopRoot();
}

function dataRoot(): string {
  return process.env.ROSETTA_DATA_ROOT || join(app.getPath("userData"), "workspace");
}

async function restoreLoginShellPath(): Promise<void> {
  if (process.platform === "win32") return;
  const shellPath = process.env.SHELL || "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(shellPath, ["-ilc", "printf '%s\\n' \"$PATH\""], {
      timeout: 5_000,
      maxBuffer: 128 * 1024,
    });
    const loginPath = stdout.trim().split("\n").filter(Boolean).at(-1);
    if (loginPath) process.env.PATH = `${loginPath}:${process.env.PATH || ""}`;
  } catch {
    // The inherited PATH remains usable when a login shell cannot be queried.
  }
}

function contentType(path: string): string {
  const extension = path.toLowerCase().split(".").at(-1);
  return ({
    css: "text/css; charset=utf-8",
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    map: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    woff2: "font/woff2",
  } as Record<string, string>)[extension || ""] || "application/octet-stream";
}

async function staticTarget(urlValue: string): Promise<string | null> {
  const url = new URL(urlValue, "http://127.0.0.1");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const root = resolve(rendererRoot());
  const candidate = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  const child = relative(root, candidate);
  if (!child || child.startsWith("..") || resolve(root, child) !== candidate) return null;
  const metadata = await stat(candidate).catch(() => null);
  if (metadata?.isFile()) return candidate;
  if (pathname.includes(".")) return null;
  return join(root, "index.html");
}

async function startLocalServer(): Promise<LocalServer> {
  const apiModulePath = join(__dirname, "desktop-api.cjs");
  const api = await import(pathToFileURL(apiModulePath).href) as DesktopApiModule;
  const server = createServer((request, response) => {
    void (async () => {
      if (await api.handleNotebookApiRequest(request, response)) return;
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET, HEAD");
        response.end();
        return;
      }
      const target = await staticTarget(request.url || "/");
      if (!target) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      const metadata = await stat(target);
      response.statusCode = 200;
      response.setHeader("Content-Type", contentType(target));
      response.setHeader("Content-Length", metadata.size);
      response.setHeader("Cache-Control", target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(target).on("error", () => response.destroy()).pipe(response);
    })().catch((error) => {
      console.error("[desktop] request failed", error);
      if (!response.headersSent) response.statusCode = 500;
      response.end("Internal server error");
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Desktop server did not bind to a TCP port");
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

async function runCodexLogin(): Promise<{ ok: boolean; message: string }> {
  try {
    await execFileAsync("codex", ["login"], { timeout: 10 * 60_000, maxBuffer: 512 * 1024, env: process.env });
    return { ok: true, message: "Codex sign-in completed" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: detail.includes("ENOENT") ? "Codex CLI was not found on this computer" : `Codex sign-in did not complete: ${detail.slice(0, 300)}` };
  }
}

async function buildRunner(): Promise<{ ok: boolean; message: string }> {
  try {
    await execFileAsync("docker", ["build", "-t", RUNNER_IMAGE, join(runtimeRoot(), "runtime")], {
      cwd: runtimeRoot(),
      timeout: 20 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
    return { ok: true, message: `Built ${RUNNER_IMAGE}` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: detail.includes("ENOENT") ? "Docker was not found on this computer" : `Runner build failed: ${detail.slice(0, 300)}` };
  }
}

function installIpcHandlers(): void {
  ipcMain.handle("desktop:get-info", () => ({
    appName: PRODUCT_NAME,
    version: app.getVersion(),
    platform: process.platform,
    dataPath: dataRoot(),
  }));
  ipcMain.handle("desktop:codex-login", () => runCodexLogin());
  ipcMain.handle("desktop:build-runner", () => buildRunner());
  ipcMain.handle("desktop:show-data", async () => {
    mkdirSync(dataRoot(), { recursive: true });
    const error = await shell.openPath(dataRoot());
    return { ok: !error, message: error || "Opened local data folder" };
  });
}

function createWindow(origin: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    title: PRODUCT_NAME,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (allowedExternalProtocols.has(parsed.protocol)) void shell.openExternal(url);
    } catch {
      // Invalid external URLs are ignored.
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, destination) => {
    if (destination.startsWith(origin)) return;
    event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(origin);
  return window;
}

async function runDesktopSmoke(origin: string): Promise<void> {
  const [page, profile, inspection] = await Promise.all([
    fetch(origin).then(async (response) => ({ status: response.status, body: await response.text() })),
    fetch(`${origin}/api/system/profile`).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, unknown> })),
    fetch(`${origin}/api/studies/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperUrl: "https://arxiv.org/abs/2106.09685",
        repositoryUrl: "https://github.com/microsoft/LoRA",
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, unknown> })),
  ]);
  if (page.status !== 200 || !page.body.includes('<div id="root"></div>')) throw new Error("Desktop renderer did not load");
  if (profile.status !== 200 || typeof profile.body.platform !== "string") throw new Error("Desktop API did not return a system profile");
  const paper = inspection.body.paper as Record<string, unknown> | undefined;
  const repository = inspection.body.repository as Record<string, unknown> | undefined;
  const paperDocument = inspection.body.paperDocument as Record<string, unknown> | undefined;
  if (
    inspection.status !== 200
    || typeof inspection.body.studyId !== "string"
    || typeof paper?.title !== "string"
    || repository?.fullName !== "microsoft/LoRA"
    || typeof paperDocument?.sha256 !== "string"
  ) {
    throw new Error(`Desktop source inspection failed (${inspection.status}): ${JSON.stringify(inspection.body).slice(0, 600)}`);
  }
  process.stdout.write(`${JSON.stringify({
    ready: true,
    origin,
    platform: profile.body.platform,
    sourceInspection: {
      paper: paper.title,
      repository: repository.fullName,
      pages: paperDocument.retainedPages,
    },
  })}\n`);
}

let localServer: LocalServer | null = null;
let mainWindow: BrowserWindow | null = null;
const desktopSmoke = process.env.ROSETTA_DESKTOP_SMOKE === "1" || process.argv.includes("--desktop-smoke");

function smokeTrace(stage: string): void {
  if (desktopSmoke) process.stderr.write(`[desktop-smoke] ${stage}\n`);
}

if (!desktopSmoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    smokeTrace("electron-ready");
    Menu.setApplicationMenu(null);
    await restoreLoginShellPath();
    smokeTrace("path-ready");
    const root = runtimeRoot();
    process.chdir(root);
    process.env.ROSETTA_APP_ROOT = root;
    process.env.ROSETTA_DATA_ROOT = dataRoot();
    mkdirSync(dataRoot(), { recursive: true });
    installIpcHandlers();
    smokeTrace("loading-server");
    localServer = await startLocalServer();
    smokeTrace("server-ready");
    if (desktopSmoke) {
      await runDesktopSmoke(localServer.origin);
      smokeTrace("requests-passed");
      app.quit();
      return;
    }
    mainWindow = createWindow(localServer.origin);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && localServer) mainWindow = createWindow(localServer.origin);
    });
  }).catch((error) => {
    console.error("[desktop] startup failed", error);
    app.exit(1);
  });
}

app.on("before-quit", () => {
  localServer?.server.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
