import { Bookmark, NotionDatabase } from "../types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotionError';
  }
}

// Helper to handle fetch with Proxy and Headers
async function notionFetch(endpoint: string, method: string, token: string, proxyUrl: string, body?: any) {
  const targetUrl = `${NOTION_API_BASE}${endpoint}`;
  // If a proxy is provided, prepend it. If proxyUrl is empty string, fetch directly.
  const fetchUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(targetUrl)}` : targetUrl;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  const response = await fetch(fetchUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorMsg = `Notion API Error: ${response.status}`;
    try {
      const errData = await response.json();
      errorMsg = errData.message || errorMsg;
    } catch (e) {
      // ignore json parse error
    }
    throw new NotionError(errorMsg);
  }

  return response.json();
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
  bookmarks: Bookmark[]
): Promise<{ success: number; failed: number }> {
  
  // 1. Ensure the database has the required schema columns
  try {
      await ensureDatabaseSchema(token, proxyUrl, databaseId, databaseProperties);
  } catch (e) {
      console.warn("Failed to update database schema, attempting to proceed with existing properties...", e);
  }

  // 2. Map properties. We prioritize the standard names we expect/enforced.
  // Note: Notion properties are keyed by their ID usually in API responses, but we need Names for creation? 
  // Actually, for creating pages, we can use property Names or IDs. Using Names is safer if we just created them.
  
  // Find the Title property (always exists)
  const titlePropKey = Object.keys(databaseProperties).find(k => databaseProperties[k].type === 'title');
  const titlePropName = titlePropKey ? databaseProperties[titlePropKey].name : 'Name';

  let success = 0;
  let failed = 0;

  for (const bookmark of bookmarks) {
    try {
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
      // We put the summary in the property 'Description', but also optionally in body? 
      // User asked for summary as 'Description' property. Let's keep body for Sources only.
      
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

      success++;
    } catch (e) {
      console.error(`Failed to export bookmark ${bookmark.url} to Notion`, e);
      failed++;
    }
  }

  return { success, failed };
}
