import type { SaveUrlItem } from '../../shared/protocol';

// Port of legacy/components/UrlInput.tsx#handleSubmit: the paste box accepts a plain list, a
// numbered/bulleted list, or lines copied straight out of a bookmarks.html file. Everything
// past this point is normalised in packages/core/src/url.

const NETSCAPE_WITH_DATE = /<a\s+href="([^"]+)"[^>]*add_date="(\d+)"/i;
const NETSCAPE_HREF = /<a\s+href="([^"]+)"/i;
const LIST_NUMBER = /^\d+\s*[.)\-]\s+/;
const LIST_BULLET = /^[-*]\s+/;

export function parsePastedUrls(text: string): SaveUrlItem[] {
  const items: SaveUrlItem[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dated = NETSCAPE_WITH_DATE.exec(trimmed);
    if (dated?.[1] && dated[2]) {
      // ADD_DATE is a Unix timestamp in seconds.
      const ms = Number.parseInt(dated[2], 10) * 1000;
      const iso = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
      items.push(iso === null ? { url: dated[1] } : { url: dated[1], addDate: iso });
      continue;
    }

    const href = NETSCAPE_HREF.exec(trimmed);
    if (href?.[1]) {
      items.push({ url: href[1] });
      continue;
    }

    // Any other markup line (<DT>, <H3>, …) is structure, not a link.
    if (trimmed.startsWith('<')) continue;

    const cleaned = trimmed.replace(LIST_NUMBER, '').replace(LIST_BULLET, '').trim();
    if (cleaned) items.push({ url: cleaned });
  }
  return items;
}
