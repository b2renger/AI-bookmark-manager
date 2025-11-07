
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