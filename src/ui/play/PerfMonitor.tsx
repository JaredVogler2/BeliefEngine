import { useEffect, useState } from 'react';
import type { WorldRenderer } from '../../render/types.ts';

/**
 * The developer quality monitor: frame times, draw calls, triangles, shader programs, video memory and how the people are drawn, read
 * from the 3D world twice a second. It shows only with `?perf=1` in the address, for whoever is measuring; players never see it.
 */
export const PERF_MONITOR = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('perf') === '1';

interface Info {
  fps: number; frameP50Ms: number; frameP95Ms: number; drawMs: number; calls: number; triangles: number; geometries: number; textures: number; programs: number;
  tier: string; scale: number; buildMs: number; firstDrawMs: number; worstDrawMs: number; hitches: number;
}
interface Memory { textureMB: number; targetMB: number; people: { near: number; far: number }; standIns: string[] }

export function PerfMonitor({ renderer }: { renderer: () => WorldRenderer | null }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let mem: Memory | null = null;
    let tick = 0;
    const id = window.setInterval(() => {
      const r = renderer() as (WorldRenderer & { info?: () => Info; memory?: () => Memory }) | null;
      if (!r?.info) return;
      const i = r.info();
      // the memory walk visits the whole scene: every fourth reading is enough
      if (r.memory && tick++ % 4 === 0) mem = r.memory();
      const k = (n: number): string => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
      setLines([
        `${i.tier} ×${i.scale}  ${Math.round(i.fps)} fps  frame p50 ${i.frameP50Ms} / p95 ${i.frameP95Ms} ms  draw ${i.drawMs} ms`,
        `calls ${i.calls}  tris ${k(i.triangles)}  geoms ${i.geometries}  tex ${i.textures}  programs ${i.programs}`,
        `build ${i.buildMs} ms  first draw ${i.firstDrawMs} ms  worst ${i.worstDrawMs} ms  hitches ${i.hitches}`,
        ...(mem ? [`video ≈ ${mem.textureMB} MB textures + ${mem.targetMB} MB targets  people ${mem.people.near} close / ${mem.people.far} far${mem.standIns.length ? `  STAND-INS ${mem.standIns.join(', ')}` : ''}`] : []),
      ]);
    }, 500);
    return () => window.clearInterval(id);
  }, [renderer]);
  if (!lines.length) return null;
  return <pre className="perf-monitor" aria-hidden="true" data-testid="perf-monitor">{lines.join('\n')}</pre>;
}
