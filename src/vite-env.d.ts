/// <reference types="vite/client" />

interface DesktopActionResult {
  ok: boolean;
  message: string;
}

interface RosettaDesktopBridge {
  getInfo(): Promise<{ appName: string; version: string; platform: string; dataPath: string }>;
  signInCodex(): Promise<DesktopActionResult>;
  buildRunner(): Promise<DesktopActionResult>;
  showDataFolder(): Promise<DesktopActionResult>;
}

interface Window {
  rosettaDesktop?: RosettaDesktopBridge;
}
