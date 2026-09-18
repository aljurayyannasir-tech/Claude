const HOSTILE_MOBS = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray',
  'spider', 'cave_spider', 'creeper', 'enderman', 'witch', 'slime',
  'phantom', 'pillager', 'vindicator', 'evoker', 'ravager', 'blaze',
  'magma_cube', 'ghast', 'guardian', 'elder_guardian', 'silverfish',
  'wither_skeleton', 'zoglin', 'piglin_brute', 'hoglin',
]);

const FOOD_ITEMS = new Set([
  'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'baked_potato', 'carrot',
  'apple', 'golden_apple', 'melon_slice', 'sweet_berries', 'beetroot',
  'potato', 'pumpkin_pie', 'mushroom_stew', 'rabbit_stew', 'beetroot_soup',
]);

const WEAPON_ITEMS_SUFFIX = ['_sword', '_axe'];

export function isHostile(entity) {
  if (!entity || entity.type !== 'mob') return false;
  const name = entity.name || (entity.mobType || '').toLowerCase();
  return HOSTILE_MOBS.has(name);
}

export function isFoodItem(name) {
  return FOOD_ITEMS.has(name);
}

export function isWeapon(name) {
  return WEAPON_ITEMS_SUFFIX.some((suffix) => name.endsWith(suffix));
}

export function inventoryCounts(bot) {
  const counts = {};
  for (const item of bot.inventory.items()) {
    counts[item.name] = (counts[item.name] || 0) + item.count;
  }
  return counts;
}

export function detectToolTier(counts) {
  if (Object.keys(counts).some((n) => n.startsWith('iron_') && (n.endsWith('_pickaxe') || n.endsWith('_axe') || n.endsWith('_sword')))) {
    return 'iron';
  }
  if (Object.keys(counts).some((n) => n.startsWith('stone_') && (n.endsWith('_pickaxe') || n.endsWith('_axe') || n.endsWith('_sword')))) {
    return 'stone';
  }
  if (Object.keys(counts).some((n) => n.startsWith('wooden_') && (n.endsWith('_pickaxe') || n.endsWith('_axe') || n.endsWith('_sword')))) {
    return 'wood';
  }
  return 'none';
}

export function hasAnyFood(counts) {
  return Object.keys(counts).some((n) => isFoodItem(n) && counts[n] > 0);
}

export function hasAnyWeapon(counts) {
  return Object.keys(counts).some((n) => isWeapon(n) && counts[n] > 0);
}
