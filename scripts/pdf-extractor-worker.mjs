import { readFile, writeFile } from "node:fs/promises";
import { extractText, getDocumentProxy, getMeta } from "unpdf";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("PDF input and output paths are required");

const source = await readFile(inputPath);
const document = await getDocumentProxy(new Uint8Array(source));
const rawMetadata = await getMeta(document).catch(() => ({ info: {} }));
const extracted = await extractText(document, { mergePages: false });
let retainedCharacters = 0;
const pages = [];
for (const page of extracted.text.slice(0, 500)) {
  if (retainedCharacters >= 2_000_000) break;
  const normalized = page
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, Math.min(100_000, 2_000_000 - retainedCharacters));
  pages.push(normalized);
  retainedCharacters += normalized.length;
}

const info = rawMetadata.info && typeof rawMetadata.info === "object" ? rawMetadata.info : {};
const metadata = {
  title: typeof info.Title === "string" ? info.Title.slice(0, 500) : "",
  author: typeof info.Author === "string" ? info.Author.slice(0, 1_000) : "",
  subject: typeof info.Subject === "string" ? info.Subject.slice(0, 2_000) : "",
};

await writeFile(outputPath, `${JSON.stringify({ totalPages: extracted.totalPages, pages, metadata })}\n`, "utf8");
