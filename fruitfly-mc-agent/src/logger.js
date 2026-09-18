import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Writes one JSON object per line (JSONL) per decision tick: a
// (state, action, reason, reward) record. This is the raw material for
// eventually training a real policy (behavior cloning / offline RL) on
// FruitFly's play history -- see data/README.md for the schema and
// scripts/analyze_dataset.py for turning accumulated logs into stats and a
// cleaned training-ready export. This module only guarantees the logging
// is correct and durable; it makes no claim about dataset size until you've
// actually run sessions to fill it.
export class DatasetLogger {
  constructor({ sessionId, dataDir = path.join(process.cwd(), 'data', 'episodes') } = {}) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.dataDir = dataDir;
    mkdirSync(this.dataDir, { recursive: true });
    this.filePath = path.join(this.dataDir, `${this.sessionId}.jsonl`);
    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.tick = 0;
    this.recordCount = 0;
  }

  log({ state, action, reason, reward }) {
    this.tick += 1;
    this.recordCount += 1;
    const record = {
      ts: new Date().toISOString(),
      session: this.sessionId,
      tick: this.tick,
      state,
      action,
      reason,
      reward,
    };
    this.stream.write(`${JSON.stringify(record)}\n`);
    return record;
  }

  close() {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}

export function sessionExists(dataDir, sessionId) {
  return existsSync(path.join(dataDir, `${sessionId}.jsonl`));
}
