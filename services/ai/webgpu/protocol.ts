/** Messages exchanged between the page and the WebGPU worker. */

export interface WorkerProgress {
  status: 'downloading' | 'generating' | 'ready' | 'error';
  text: string;
  /** 0 to 1. */
  progress: number;
}

export type WorkerRequest =
  | { id: string; type: 'load'; modelId: string }
  | {
      id: string;
      type: 'generate';
      modelId: string;
      payload: { system: string; user: string; schema: string; maxTokens: number };
    }
  | { id: string; type: 'unload' };

export interface WorkerResponse {
  id: string;
  type: 'progress' | 'ready' | 'result' | 'error';
  /**
   * 'init' marks messages emitted while loading the model on the way to an
   * answer. They must not settle the request they are tagged with.
   */
  phase?: 'init';
  progress?: WorkerProgress;
  data?: { text: string };
  error?: string;
}
