export interface PdfTextItemRange {
  start: number;
  end: number;
  startOffset?: number;
  endOffset?: number;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function pdfTextItemRange(items: string[], passage: string): PdfTextItemRange | null {
  let normalized = "";
  const positions: Array<{ itemIndex: number; rawOffset: number }> = [];
  items.forEach((item, itemIndex) => {
    let value = "";
    const rawOffsets: number[] = [];
    let previousWasSpace = false;
    for (let rawOffset = 0; rawOffset < item.length; rawOffset += 1) {
      const character = item[rawOffset];
      if (/\s/.test(character)) {
        if (value && !previousWasSpace) {
          value += " ";
          rawOffsets.push(rawOffset);
        }
        previousWasSpace = true;
      } else {
        value += character;
        rawOffsets.push(rawOffset);
        previousWasSpace = false;
      }
    }
    if (value.endsWith(" ")) {
      value = value.slice(0, -1);
      rawOffsets.pop();
    }
    if (!value) return;
    if (normalized && !normalized.endsWith(" ")) {
      normalized += " ";
      positions.push({ itemIndex, rawOffset: 0 });
    }
    for (let offset = 0; offset < value.length; offset += 1) {
      normalized += value[offset];
      positions.push({ itemIndex, rawOffset: rawOffsets[offset] });
    }
  });

  let searchable = "";
  const searchablePositions: Array<{ itemIndex: number; rawOffset: number }> = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (!/[\p{L}\p{N}]/u.test(normalized[index])) continue;
    searchable += normalized[index].toLocaleLowerCase();
    searchablePositions.push(positions[index]);
  }
  const target = [...compact(passage).toLocaleLowerCase()].filter((character) => /[\p{L}\p{N}]/u.test(character)).join("");
  const exactStart = searchable.indexOf(target);
  if (exactStart < 0 || !target) return null;
  const first = searchablePositions[exactStart];
  const last = searchablePositions[exactStart + target.length - 1];
  return { start: first.itemIndex, end: last.itemIndex, startOffset: first.rawOffset, endOffset: last.rawOffset + 1 };
}
