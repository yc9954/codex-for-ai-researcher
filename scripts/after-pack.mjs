import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default async function afterPack(context) {
  if (
    context.electronPlatformName !== "darwin"
    || process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false"
  ) {
    return;
  }

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
    { stdio: "inherit" },
  );
}
