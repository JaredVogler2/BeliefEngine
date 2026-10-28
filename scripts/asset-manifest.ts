/**
 * Writes the 3D asset manifest: every generator in `scripts/asset-catalog.ts`, run with a fixed seed, and what it built (triangles,
 * meshes, materials, pivots, extent, origin, normals, vertex colours, texture coordinates). The world ships no model files, so this
 * is read from the code that makes the models, and it changes whenever they do.
 *   npx tsx scripts/asset-manifest.ts [--out docs/3d-rebuild/data/asset-manifest.json] [--md]
 */
import { writeFileSync } from 'node:fs';
import { catalog, describe } from './asset-catalog.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = at >= 0 ? args[at + 1] : 'docs/3d-rebuild/data/asset-manifest.json';
const rows = catalog().map((e) => describe(e, 1));
const manifest = {
  generatedBy: 'npx tsx scripts/asset-manifest.ts',
  units: 'world units; one tile of the engine map is one unit square',
  origin: "each asset's origin is its base, in the middle of its footprint (the bridge is brought back to its own centre)",
  textures:
    'textured materials paint one canvas each at load (RGBA8, sRGB, 256 px square, 128 px on the low tier, repeat-wrapped, mipmapped, anisotropic filtering up to 8 or the GPU limit); materials with relief use the same canvas as their bump map; tinted variants share it. Trees, people and ground cover carry their colours in their vertices or per instance and use no texture.',
  ambientOcclusion:
    'no occlusion is baked into building textures; on the medium and high tiers the finishing chain adds screen-space ambient occlusion. The underside of each tree crown is darker in its vertex colours (the crown shading itself), and the painted ground is darkened round each building.',
  seed: 1,
  assets: rows,
};
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${rows.length} assets written to ${out}`);
if (args.includes('--md')) {
  console.log('| Asset | Generator | Triangles | Meshes | Extent (w × h × d) | Materials |');
  console.log('|---|---|---:|---:|---|---|');
  for (const r of rows) console.log(`| ${r.id} | \`${r.source}\` | ${r.triangles.toLocaleString('en')} | ${r.meshes} | ${r.size.map((v) => v.toFixed(2)).join(' × ')} | ${r.materials.length} |`);
}
