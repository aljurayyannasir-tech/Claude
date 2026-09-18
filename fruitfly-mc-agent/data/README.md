# Dataset

This directory fills up as FruitFly plays:

- `episodes/<session>.jsonl` — one line per decision tick, written live by
  `src/logger.js`.
- `memory.json` — persisted learning/planning state (bandit values, city
  build plan, lifetime stats). Loaded and re-saved every session, which is
  what lets the agent "remember" between restarts.

Both are gitignored by default (see `.gitignore`) since they're runtime
output specific to a given world/server, not source. Delete `memory.json`
to reset the agent to a blank slate; delete `episodes/` to clear the
logged dataset.

## `episodes/*.jsonl` schema

Each line is one JSON object:

```json
{
  "ts": "2026-09-18T00:00:01.234Z",
  "session": "session_1758150000000",
  "tick": 42,
  "state": {
    "health": 20, "food": 17, "isNight": false, "hostileNearby": false,
    "toolTier": "stone", "hasShelter": true, "hasFarm": true,
    "cityCompleted": 3
  },
  "action": { "type": "GATHER_STONE", "params": {} },
  "reason": "mining cobblestone for stone tool upgrade",
  "reward": 0.1
}
```

- `state` is a compact snapshot (not the full inventory/world) of what the
  decision was based on — see `src/perception.js` for the full internal
  `AgentState` shape and `src/index.js` for which fields get logged.
- `action` is exactly what `decideNextAction()` returned.
- `reason` is a human-readable justification from the same deterministic
  rule that picked the action (useful for debugging and for anyone
  auditing *why* the bot did something).
- `reward` comes from `src/learning/reward.js`'s hand-shaped reward
  function (survival + progress milestones - death/failure penalties).

## Using this for training

`scripts/analyze_dataset.py` summarizes what's been collected and can
export a cleaned `(state, action)` JSONL. That export is in the right
*shape* for behavior cloning (supervised learning: predict the action from
the state) or as the base for offline RL, but actually training a model on
it is a separate step this repo doesn't do for you — see the main
[README's Roadmap section](../README.md#roadmap-turning-the-dataset-into-a-trained-policy)
for what that would take and why a single play session's log is nowhere
near enough data to claim "professional human" level.
