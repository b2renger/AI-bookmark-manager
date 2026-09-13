import type { ImporterId, Importer, ImportSource } from './types.js';
import { netscapeImporter } from './netscape.js';
import { chromeImporter } from './chrome.js';
import { firefoxImporter } from './firefox.js';
import { raindropImporter } from './raindrop.js';
import { karakeepImporter } from './karakeep.js';
import { pocketImporter } from './pocket.js';
import { csvImporter } from './csv.js';
import { notionImporter } from './notion.js';

export * from './types.js';
export * from './util.js';
export * from './netscape.js';
export * from './chrome.js';
export * from './firefox.js';
export * from './raindrop.js';
export * from './karakeep.js';
export * from './pocket.js';
export * from './csv.js';
export * from './notion.js';

export const importers: Record<ImporterId, Importer> = {
  netscape: netscapeImporter,
  chrome: chromeImporter,
  firefox: firefoxImporter,
  raindrop: raindropImporter,
  karakeep: karakeepImporter,
  pocket: pocketImporter,
  csv: csvImporter,
  notion: notionImporter,
};

/** Every importer's confidence, best first. Zero-confidence candidates are dropped. */
export function detectImporter(src: ImportSource): { id: ImporterId; confidence: number }[] {
  const scored: { id: ImporterId; confidence: number }[] = [];
  for (const importer of Object.values(importers)) {
    let confidence = 0;
    try {
      confidence = importer.sniff(src);
    } catch {
      confidence = 0;
    }
    if (confidence > 0) scored.push({ id: importer.id, confidence });
  }
  return scored.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}
