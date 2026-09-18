import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_DIR = path.join(__dirname, '..', 'blueprints');

const CACHE = new Map();

/**
 * Load a blueprint JSON file by name (without extension) and expand its
 * layer/legend representation into a flat list of { dx, dy, dz, block }
 * placements, skipping 'air' cells. Placement origin (0,0,0) is the
 * south-west floor corner.
 */
export function loadBlueprint(name) {
  if (CACHE.has(name)) return CACHE.get(name);

  const file = path.join(BLUEPRINT_DIR, `${name}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const blocks = [];

  raw.layers.forEach((layer, dy) => {
    layer.forEach((row, dz) => {
      for (let dx = 0; dx < row.length; dx++) {
        const symbol = row[dx];
        const block = raw.legend[symbol];
        if (!block || block === 'air') continue;
        blocks.push({ dx, dy, dz, block });
      }
    });
  });

  const blueprint = { ...raw, blocks };
  CACHE.set(name, blueprint);
  return blueprint;
}

export function listBlueprintNames() {
  return ['starter_house', 'farm_plot', 'warehouse', 'watchtower'];
}
