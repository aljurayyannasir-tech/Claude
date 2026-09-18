export function loadConfig(env = process.env) {
  return {
    host: env.MC_HOST || 'localhost',
    port: Number(env.MC_PORT || 25565),
    username: env.MC_USERNAME || 'FruitFly',
    auth: env.MC_AUTH || 'offline', // 'offline' for cracked/local servers, 'microsoft' for premium accounts
    version: env.MC_VERSION || undefined, // let mineflayer auto-detect if unset
    tickIntervalMs: Number(env.TICK_INTERVAL_MS || 1500),
    sessionId: env.SESSION_ID || undefined,
    memoryPath: env.MEMORY_PATH || undefined,
  };
}
