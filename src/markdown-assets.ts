const rasterExtension = /\.(?:png|jpe?g|webp)$/i;

export function markdownImageUrl(source: string | undefined): string | undefined {
  if (!source) return source;
  const normalized = source.replace(/\\/g, "/").split(/[?#]/, 1)[0];
  const match = normalized.match(/(?:^|\/)runs\/(run-[a-zA-Z0-9_-]+)\/(.+)$/);
  if (!match || !rasterExtension.test(match[2])) return source;
  let artifactParts: string[];
  try {
    artifactParts = match[2].split("/").map((part) => decodeURIComponent(part));
  } catch {
    return source;
  }
  if (artifactParts.some((part) => !part || part === "." || part === "..")) return source;
  return `/api/runs/${encodeURIComponent(match[1])}/artifacts/${artifactParts.map(encodeURIComponent).join("/")}`;
}
