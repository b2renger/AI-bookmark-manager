
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  summary: string;
  keywords: string[];
  status: 'processing' | 'done' | 'error' | 'warning';
  createdAt: string; // ISO date string
  sources?: { uri: string; title: string }[];
  errorMessage?: string;
  confidenceScore?: number; // 0 to 100
  confidenceReason?: string;
  platform?: 'youtube' | 'threads' | 'twitter' | 'github' | 'article' | 'website';
  author?: string;
  thumbnailUrl?: string;
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
