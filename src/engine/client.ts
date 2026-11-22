// Main-thread handle on the engine worker. Only the newest request per channel resolves; stale ones are dropped.
import type { Cfg } from './index';
import type { RunRequest, RunResponse } from './worker';

export interface Engine { run(cfg: Cfg, seeds: number, trace: boolean): Promise<RunResponse>; dispose(): void }

export function createEngine(): Engine {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (r: RunResponse) => void>();
  let next = 1;
  worker.onmessage = (e: MessageEvent<RunResponse>) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
  return {
    run(cfg, seeds, trace) {
      const id = next++;
      const req: RunRequest = { id, cfg, seeds, trace };
      return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage(req); });
    },
    dispose() { worker.terminate(); pending.clear(); },
  };
}
