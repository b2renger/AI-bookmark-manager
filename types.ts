
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  summary: string;
  keywords: string[];
  status: 'processing' | 'done' | 'error' | 'warning';
  createdAt: string; // ISO date string
  sources?: { uri: string; title: string }[];
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

export interface NotionConfig {
  apiKey: string;
  proxyUrl: string;
}
