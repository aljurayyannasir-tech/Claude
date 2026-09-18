import { Vec3 } from 'vec3';

const FACE_CANDIDATES = [
  { face: new Vec3(0, 1, 0), from: (p) => p.offset(0, -1, 0) },
  { face: new Vec3(0, -1, 0), from: (p) => p.offset(0, 1, 0) },
  { face: new Vec3(1, 0, 0), from: (p) => p.offset(-1, 0, 0) },
  { face: new Vec3(-1, 0, 0), from: (p) => p.offset(1, 0, 0) },
  { face: new Vec3(0, 0, 1), from: (p) => p.offset(0, 0, -1) },
  { face: new Vec3(0, 0, -1), from: (p) => p.offset(0, 0, 1) },
];

/**
 * Place `itemName` at `targetPos` by finding an already-solid neighboring
 * block to place against (checking "below" first since blueprints are
 * built bottom-up, which is the common case). Returns true on success.
 */
export async function placeAt(bot, targetPos, itemName) {
  const existing = bot.blockAt(targetPos);
  if (existing && existing.name === itemName) return true; // already placed

  const item = bot.inventory.items().find((i) => i.name === itemName);
  if (!item) return false;

  for (const candidate of FACE_CANDIDATES) {
    const refPos = candidate.from(targetPos);
    const refBlock = bot.blockAt(refPos);
    if (!refBlock || refBlock.boundingBox !== 'block') continue;
    try {
      await bot.equip(item, 'hand');
      await bot.placeBlock(refBlock, candidate.face.scaled(-1));
      return true;
    } catch {
      // try next candidate face
    }
  }
  return false;
}

/**
 * Place an entire loaded blueprint (see utils/blueprints.js) starting at
 * world position `origin`, bottom layer first so every block placed after
 * the floor always has a solid reference block beneath it.
 * Returns { placed, failed } counts.
 */
export async function placeBlueprint(bot, blueprint, origin) {
  let placed = 0;
  let failed = 0;
  const sorted = [...blueprint.blocks].sort((a, b) => a.dy - b.dy);
  for (const cell of sorted) {
    // Skip decorative/interactive blocks that don't come from raw gather
    // loops (door/window); best-effort only, never block the build.
    const targetPos = origin.offset(cell.dx, cell.dy, cell.dz);
    const ok = await placeAt(bot, targetPos, cell.block);
    if (ok) placed += 1;
    else failed += 1;
  }
  return { placed, failed };
}
