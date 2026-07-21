/// <reference types="vite/client" />

interface DesktopActionResult {
  ok: boolean;
  message: string;
}

interface CodexDesktopBridge {
  getInfo(): Promise<{ appName: string; version: string; platform: string; dataPath: string }>;
  signInCodex(): Promise<DesktopActionResult>;
  buildRunner(): Promise<DesktopActionResult>;
  showDataFolder(): Promise<DesktopActionResult>;
}

interface Window {
  codexDesktop?: CodexDesktopBridge;
}
