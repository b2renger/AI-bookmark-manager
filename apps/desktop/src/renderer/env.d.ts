/// <reference types="vite/client" />
import type { CairnApi } from '../shared/protocol';

declare global {
  interface Window {
    cairn: CairnApi;
  }
}

declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}

export {};
