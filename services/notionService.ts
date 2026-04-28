import { Bookmark, NotionDatabase } from "../types";
import { proxyFetch } from '../lib/proxyFetch';

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotionError';
  }
}

// Helper to handle fetch with Proxy and Headers
async function notionFetch(endpoint: string, method: string, token: string, proxyUrl: string, body?: any, maxRetries = 5) {
  const targetUrl = `${NOTION_API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      if (attempt > 0) {
        console.log(`Retrying Notion API request (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      } else {
        console.log(`[NotionFetch] Initiating ${method} to ${endpoint}`);
        console.log(`[NotionFetch] Target URL: ${targetUrl}`);
        console.log(`[NotionFetch] Headers (excluding token): Notion-Version=${NOTION_VERSION}`);
      }

      const response = await proxyFetch(targetUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }, proxyUrl);

      const responseText = await response.text();

      if (!response.ok) {
        // Handle Rate Limiting (429)
        if (response.status === 429 && attempt < maxRetries) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * Math.pow(2, attempt);
          console.warn(`Notion API Rate Limit hit (429). Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
          continue;
        }

        console.error(`[NotionFetch] Failed: Status ${response.status}`);
        console.error(`[NotionFetch] Response Body: ${responseText}`);

        let errorMsg = `Notion API Error: ${response.status} ${response.statusText}`;
        try {
          const errData = JSON.parse(responseText);
          errorMsg = errData.message || errorMsg;
        } catch (e) {
          // ignore json parse error
        }
        throw new NotionError(errorMsg);
      }

      return JSON.parse(responseText);
    } catch (error) {
      if (error instanceof NotionError) throw error;
      
      // Handle network errors (CORS, Proxy down, etc.)
      console.error(`[NotionFetch] Network error during fetch to ${targetUrl}:`, error);
      throw new NotionError(
        "Network Error: Failed to connect to Notion. If you are using CORSProxy.io, it is likely blocking requests from the AI Studio preview domain. Please switch to 'Built-in Server Proxy' in Settings, or run the app locally."
      );
    }
  }
}

export async function getAccessibleDatabases(token: string, proxyUrl: string): Promise<NotionDatabase[]> {
  try {
    // Search for databases
    const data = await notionFetch("/search", "POST", token, proxyUrl, {
      filter: {
        value: "database",
        property: "object",
      },
      page_size: 100,
    });

    return data.results.map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Untitled Database",
      url: db.url,
      properties: db.properties,
    }));
  } catch (error) {
    console.error("Failed to fetch Notion databases", error);
    throw error;
  }
}

async function ensureDatabaseSchema(token: string, proxyUrl: string, databaseId: string, currentProperties: Record<string, any>) {
    const propertiesToUpdate: Record<string, any> = {};

    // Helper to check if a property exists with specific name and type
    const hasProperty = (name: string, type: string) => {
        return Object.values(currentProperties).some((p: any) => p.name === name && p.type === type);
    };

    // 1. URL (Type: url) -> "URL"
    if (!hasProperty('URL', 'url')) {
        propertiesToUpdate['URL'] = { url: {} };
    }
    
    // 2. Summary (Type: rich_text) -> "Description"
    if (!hasProperty('Description', 'rich_text')) {
        propertiesToUpdate['Description'] = { rich_text: {} };
    }

    // 3. Keywords (Type: multi_select) -> "Keywords"
    if (!hasProperty('Keywords', 'multi_select')) {
        propertiesToUpdate['Keywords'] = { multi_select: {} };
    }

    // 4. CreatedAt (Type: date) -> "Date"
    if (!hasProperty('Date', 'date')) {
        propertiesToUpdate['Date'] = { date: {} };
    }

    if (Object.keys(propertiesToUpdate).length > 0) {
        await notionFetch(`/databases/${databaseId}`, "PATCH", token, proxyUrl, {
            properties: propertiesToUpdate
        });
    }
}

export async function exportToNotion(
  token: string, 
  proxyUrl: string,
  databaseId: string, 
  databaseProperties: Record<string, any>, 
  bookmarks: Bookmark[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ success: Bookmark[]; failed: Bookmark[]; skipped: Bookmark[] }> {
  
  if (onProgress) onProgress(0, bookmarks.length, "Updating database schema...");
  // 1. Ensure the database has the required schema columns
  try {
      await ensureDatabaseSchema(token, proxyUrl, databaseId, databaseProperties);
  } catch (e) {
      console.warn("Failed to update database schema, attempting to proceed with existing properties...", e);
  }

  // 2. Map properties. We prioritize the standard names we expect/enforced.
  const titlePropKey = Object.keys(databaseProperties).find(k => databaseProperties[k].type === 'title');
  const titlePropName = titlePropKey ? databaseProperties[titlePropKey].name : 'Name';

  const success: Bookmark[] = [];
  const failed: Bookmark[] = [];
  const skipped: Bookmark[] = [];
  const existingUrls = new Set<string>();

  // 3. Batch query existing URLs to save API requests (max 50 conditions per OR filter to be safe)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < bookmarks.length; i += CHUNK_SIZE) {
    const chunk = bookmarks.slice(i, i + CHUNK_SIZE);
    if (onProgress) onProgress(0, bookmarks.length, `Checking existing bookmarks (Batch ${Math.floor(i/CHUNK_SIZE) + 1})...`);
    
    const orConditions = chunk.map(b => ({
      property: "URL",
      url: { equals: b.url }
    }));

    try {
      let hasMore = true;
      let nextCursor: string | undefined = undefined;

      while (hasMore) {
        const body: any = { filter: { or: orConditions } };
        if (nextCursor) body.start_cursor = nextCursor;

        const queryResult = await notionFetch(`/databases/${databaseId}/query`, "POST", token, proxyUrl, body);

        if (queryResult.results) {
          queryResult.results.forEach((page: any) => {
            const urlProp = Object.values(page.properties).find((p: any) => p.type === 'url');
            if (urlProp && typeof urlProp === 'object' && 'url' in urlProp && urlProp.url) {
              existingUrls.add(urlProp.url);
            }
          });
        }

        hasMore = queryResult.has_more;
        nextCursor = queryResult.next_cursor;
        
        // Minor delay between paginated queries
        if (hasMore) await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.warn("Failed to query existing URLs in batch, falling back to inserting all.", e);
    }
    
    // Delay between chunks
    if (bookmarks.length > CHUNK_SIZE && i + CHUNK_SIZE < bookmarks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 4. Insert non-existing bookmarks
  let processed = 0;
  for (const bookmark of bookmarks) {
    try {
      // Check if bookmark already exists
      if (existingUrls.has(bookmark.url)) {
        console.log(`Bookmark ${bookmark.url} already exists in Notion. Skipping.`);
        skipped.push(bookmark);
        processed++;
        if (onProgress) onProgress(processed, bookmarks.length, `Skipped existing: ${bookmark.title || bookmark.url}`);
        continue;
      }

      if (onProgress) onProgress(processed, bookmarks.length, `Syncing: ${bookmark.title || bookmark.url}...`);

      const properties: any = {};

      // Title
      properties[titlePropName] = {
        title: [
          { text: { content: bookmark.title || "Untitled" } }
        ]
      };

      // URL
      properties['URL'] = { url: bookmark.url };

      // Description
      const summaryText = (bookmark.summary || "").substring(0, 2000);
      properties['Description'] = {
        rich_text: [
          { text: { content: summaryText } }
        ]
      };

      // Keywords
      if (bookmark.keywords.length > 0) {
        properties['Keywords'] = {
          multi_select: bookmark.keywords.map(k => ({ name: k.replace(/,/g, '') }))
        };
      }

      // Date
      const dateVal = bookmark.createdAt ? new Date(bookmark.createdAt).toISOString() : new Date().toISOString();
      properties['Date'] = {
        date: { start: dateVal }
      };

      // Content Body (Sources)
      const children = [];
      
      if (bookmark.sources && bookmark.sources.length > 0) {
          children.push({
            object: 'block',
            type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: 'Sources' } }] }
          });
          bookmark.sources.forEach(source => {
              children.push({
                  object: 'block',
                  type: 'bulleted_list_item',
                  bulleted_list_item: {
                      rich_text: [
                          { type: 'text', text: { content: source.title || source.uri, link: { url: source.uri } } }
                      ]
                  }
              });
          });
      }

      await notionFetch("/pages", "POST", token, proxyUrl, {
        parent: { database_id: databaseId },
        properties: properties,
        children: children.length > 0 ? children : undefined
      });

      success.push(bookmark);
      processed++;
      if (onProgress) onProgress(processed, bookmarks.length, `Added: ${bookmark.title || bookmark.url}`);
      
      // Strict baseline delay to NEVER hit 3 req/sec limit
      if (processed < bookmarks.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (e) {
      console.error(`Failed to export bookmark ${bookmark.url} to Notion`, e);
      failed.push(bookmark);
      processed++;
      if (onProgress) onProgress(processed, bookmarks.length, `Failed: ${bookmark.title || bookmark.url}`);
    }
  }

  return { success, failed, skipped };
}
