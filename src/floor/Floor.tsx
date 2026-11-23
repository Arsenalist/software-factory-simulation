import type { Trace } from '../engine';
import type { FloorStation, Settings } from '../model/settings';

export interface FloorProps { trace: Trace | null; settings: Settings; focus: FloorStation | null; onSelect: (s: FloorStation | null) => void }

export function Floor(_props: FloorProps) {
  return <section class="sf-floor" aria-label="The factory floor"><div class="sf-floor-stage" /></section>;
}
