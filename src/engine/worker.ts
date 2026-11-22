/// <reference lib="webworker" />
// Runs the Monte Carlo off the main thread: N seeds, the per-metric median, and (optionally) a trace of the median seed.
import { medianOf, pickMedianSeed, runSeeds, seedFor, sim, type Cfg, type Metrics, type Trace } from './index';

export interface RunRequest { id: number; cfg: Cfg; seeds: number; trace: boolean }
export interface RunResponse { id: number; metrics: Metrics; runs: Metrics[]; trace: Trace | null; ms: number }

self.onmessage = (e: MessageEvent<RunRequest>) => {
  const { id, cfg, seeds, trace } = e.data;
  const t0 = performance.now();
  const runs = runSeeds(cfg, seeds);
  const metrics = medianOf(runs);
  const traced = trace ? sim(cfg, seedFor(pickMedianSeed(runs)), true).trace ?? null : null;
  const res: RunResponse = { id, metrics, runs, trace: traced, ms: performance.now() - t0 };
  (self as unknown as Worker).postMessage(res);
};
