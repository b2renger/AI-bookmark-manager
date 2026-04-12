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
  
  // Robust proxy URL construction
  let fetchUrl = targetUrl;
  if (proxyUrl) {
    // corsproxy.io and codetabs usually prefer encoded URLs when passed as a query or path
    if (proxyUrl.includes('corsproxy.io') || proxyUrl.includes('codetabs.com')) {
      fetchUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
    } else {
      // cors-anywhere and others expect the raw URL appended
      fetchUrl = `${proxyUrl}${targetUrl}`;
    }
  }

  console.log(`\n=== NOTION API DEBUG ===`);
  console.log(`1. Proxy Selected: "${proxyUrl || 'None'}"`);
  console.log(`2. Target Endpoint: "${targetUrl}"`);
  console.log(`3. Final Fetch URL: "${fetchUrl}"`);
  console.log(`4. Method: ${method}`);
  console.log(`5. Auth Token: ${token ? 'Bearer secret_...[HIDDEN]' : 'Missing'}`);
  if (body) console.log(`6. Request Body:`, JSON.stringify(body));
  console.log(`========================\n`);

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(fetchUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    
    console.log(`\n=== NOTION API RESPONSE ===`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));
    console.log(`Body:`, responseText.substring(0, 1000)); // Log first 1000 chars
    console.log(`===========================\n`);

    if (!response.ok) {
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
    console.error("Network error during Notion fetch:", error);
    throw new NotionError(
      "Network Error: Failed to connect to Notion. If you are using CORSProxy.io, it is likely blocking requests from the AI Studio preview domain. Please switch to 'Worker Proxy (Cloudflare)' in Settings (and follow the unlock instructions), or run the app locally."
    );
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
