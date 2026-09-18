# FruitFly — an autonomous Minecraft survival agent

FruitFly is a [Mineflayer](https://github.com/PrismarineJS/mineflayer) bot:
a Node.js program that connects to a Minecraft Java server as a real
client and plays it — surviving on Hard/Hardcore-level threat, gathering
resources, progressing through tool tiers, building a starter house and
farm, and then expanding outward into a small city of houses, farms, a
warehouse, and a watchtower. It logs every decision it makes to a dataset
as it plays, and carries a small amount of learned state between sessions.

**Scope note, stated plainly:** this is a scripted/heuristic agent (a
deterministic priority-based decision loop) with a lightweight bandit
layer for non-critical strategic choices, not a pretrained neural
network. See [Roadmap](#roadmap-turning-the-dataset-into-a-trained-policy)
below for what turning its logs into an actual trained policy would take.
It has not been run against a live server in this environment — there is
no Minecraft server or game account available in this sandbox — so treat
this as a complete, carefully-written implementation ready for you to
point at a real server and iterate on, not something already
field-tested. Read [Known limitations](#known-limitations) before
expecting it to run unattended.

## Why a Mineflayer bot and not a Fabric/Forge client mod

An in-client mod would need to reimplement pathfinding, block placement,
and combat from scratch inside the game's render/tick loop (essentially
rebuilding something like Baritone). Mineflayer already provides a robust,
well-tested protocol-level client plus pathfinding
(`mineflayer-pathfinder`), block collection (`mineflayer-collectblock`),
and hunger management (`mineflayer-auto-eat`) — the same category of tool
used by most serious "AI plays Minecraft" projects (Voyager, MineRL
integrations, etc.). It also runs headless, which is what makes automated
testing and long unattended play sessions practical.

## Setup

```bash
cd fruitfly-mc-agent
npm install
```

Point it at a server via environment variables:

```bash
MC_HOST=localhost \
MC_PORT=25565 \
MC_USERNAME=FruitFly \
MC_AUTH=offline \
npm start
```

| Variable | Default | Notes |
|---|---|---|
| `MC_HOST` | `localhost` | Server address |
| `MC_PORT` | `25565` | Server port |
| `MC_USERNAME` | `FruitFly` | Bot's in-game name |
| `MC_AUTH` | `offline` | `offline` for a cracked/offline-mode server, `microsoft` for a premium account |
| `MC_VERSION` | auto-detect | Pin a protocol version if auto-detect picks wrong |
| `TICK_INTERVAL_MS` | `1500` | Delay between decision cycles |
| `SESSION_ID` | timestamp-based | Dataset filename under `data/episodes/` |
| `MEMORY_PATH` | `data/memory.json` | Where persisted learning state lives |

### Testing locally without a real world

Spin up a vanilla or Paper server in **offline mode** for a private smoke
test (never point this at a server you don't control/own without
permission):

```bash
# example: vanilla server.jar with eula.txt accepted and online-mode=false
java -Xmx2G -jar server.jar nogui
```

Then run FruitFly with `MC_AUTH=offline` against `localhost:25565`.

### "Realistic"/hard survival

The bot doesn't set the world's difficulty — that's a server-side
setting (`/difficulty hard` or hardcore world creation). What it *does*
control is its own behavior being written for that level of threat:
aggressive hunger management before starvation damage kicks in, fleeing
when health is critical rather than fighting to the death, always
retreating to shelter before nightfall, and never assuming a death is
undoable. Run it on a hard or hardcore server for the "survive for real"
experience the request asked for.

## Architecture

```
src/
  brain/
    stateMachine.js   pure decideNextAction(state) -> action; no I/O, fully unit tested
    city.js            deterministic spiral city-grid planner (house/farm/warehouse/watchtower cycle)
  learning/
    bandit.js          epsilon-greedy bandit for non-critical choices (explore direction, blueprint order)
    reward.js           hand-shaped reward function for logging + bandit updates
    lessons.js           death-cause classification + threshold retuning -- the "learn from mistakes" layer
    qlearning.js          real tabular Q-learning (TD updates) for the FIGHT-vs-FLEE decision, once hard safety rules already ruled out anything unsafe
  utils/
    blueprints.js      loads src/blueprints/*.json into flat block lists
    placement.js        places a blueprint block-by-block against solid neighbors
    inventory.js        hostile/food/tool-tier classification helpers
  blueprints/*.json     starter_house, farm_plot, warehouse, watchtower (layer+legend format)
  perception.js         mineflayer bot -> plain AgentState object
  executors.js           AgentState action -> real mineflayer calls (gather/craft/build/fight/...)
  memory.js               load/save data/memory.json (bandit values, city plan, lifetime stats)
  logger.js                appends one JSONL record per decision tick
  index.js                 wires it all together: connect, spawn, decision loop, death/shutdown handling
```

The decision logic (`stateMachine.js`) is deliberately pure and
side-effect-free so it can be unit tested without a live connection —
`test/stateMachine.test.js` exercises every branch of the priority
ordering. Survival-critical decisions (fleeing danger, fleeing a
known-lethal mob, eating, sheltering) are fully deterministic and never
delegated to a learned component; within the *remaining* safe choices, a
bandit picks explore direction/build order and a real Q-learning layer
picks FIGHT vs FLEE (see [Reinforcement learning](#reinforcement-learning)
below) — so a cold-started (no learned data yet) bot still behaves
sensibly on every axis.

### Priority order each tick

1. Immediate danger (fire/lava, scanned with a learned safety margin) → escape
2. Hostile nearby → hard rules force flee (low health, unarmed, or a mob
   type learned to be dangerous); otherwise Q-learning picks FIGHT or FLEE
3. Critically hungry (starvation-damage territory) → eat, harvest, or hunt
4. Hungry past the learned buffer → eat if food is on hand
5. Nightfall → emergency shelter / return to shelter / sleep
6. No weapon on hand (lost, broken, never crafted) → craft/equip one before anything else
7. Raw meat + furnace available → cook it for better nutrition
8. Food reserves below the learned stockpile target → proactively harvest or hunt, even if not hungry yet
9. No crafting table / tools → gather wood → craft
10. No shelter → build the starter house
11. Tool tier gate → gather stone/iron → craft the next tier, build a furnace
12. No farm → build one; replant/harvest as crops mature
13. City plan has a ready plot → build it (else gather what it needs)
14. Nothing urgent → explore (bandit-weighted direction) to scout for the next plot

### City expansion

`src/brain/city.js` allocates plots on a deterministic outward square
spiral around the starter house, cycling through
`house, farm, house, warehouse, house, farm, house, watchtower, ...` —
weighted toward houses and farms so it actually reads as a town rather
than a monument. Each plot records its blueprint, grid position, and
completion status in `memory.json`, so the plan survives restarts and the
bot resumes exactly where it left off.

### Learning — does it actually learn from its mistakes?

Yes, concretely, in the sense that specific numbers in the decision logic
move in response to specific deaths, not just in the sense of remembering
statistics. Three things persist across restarts in `data/memory.json`:

1. **Death-cause lessons** (`src/learning/lessons.js`) — the real "learn
   from mistakes" mechanism. mineflayer's `death` event carries no cause,
   so on death the bot classifies *why* from the last state snapshot
   (`environmental_hazard`, `starvation`, `combat`, or an ambiguous
   `unknown_low_health`/`unknown`) and retunes the thresholds
   `decideNextAction()` uses next time:
   - Died of **starvation** → raises the hunger buffer and the proactive
     food-stockpile target, so it starts eating/harvesting/hunting earlier
     next time.
   - Died in **combat** → raises the health threshold at which it flees
     instead of fighting, and remembers *which mob type* got the kill —
     two losses to the same mob type (e.g. creepers) and it starts always
     fleeing that type on sight, regardless of current health or weapon.
   - Died to **lava/fire** → widens how far out it scans for hazardous
     blocks before it's willing to call an area safe.

   This is why the priority list above says "learned buffer" / "learned
   safety margin" rather than fixed numbers — those are the same rule,
   with parameters that move after real deaths. `test/lessons.test.js`
   and the tuning-aware cases in `test/stateMachine.test.js` cover this
   directly (e.g. "a raised flee-health threshold triggers flight sooner",
   "repeated combat losses to the same mob eventually mark it as avoid").
2. **Bandit values** (`src/learning/bandit.js`) — running reward
   estimates per (context, choice) pair, updated after every relevant
   action, that bias future *non-critical* choices (explore direction,
   which city blueprint to prioritize when several are viable). This
   layer never touches survival-critical decisions.
3. **Q-table** (`src/learning/qlearning.js`) — see
   [Reinforcement learning](#reinforcement-learning) below.
4. **Lifetime stats** — deaths (now broken down by cause), best survival
   duration, milestone counts (first crafting table, first stone tools,
   first iron tools, etc.) — useful for tracking whether the agent is
   actually getting better run over run.

Lessons and the bandit are honest online learning at a small scale — a
hand-written retuning rule and a running average, not anything that
searches a policy space. The Q-learning layer below is where actual
reinforcement learning lives in this codebase.

### Reinforcement learning

This is real RL, not a rebrand of the bandit above: `src/learning/qlearning.js`
implements tabular Q-learning — epsilon-greedy action selection over a
discretized state space, updated with the standard one-step temporal-difference
(Bellman) rule:

```
Q(s,a) <- Q(s,a) + alpha * (reward + gamma * max_a' Q(s',a') - Q(s,a))
```

**Where it's scoped, and why.** Per how this was built (a deliberate,
discussed choice — RL picks among *safe* options only, hard rules stay
absolute), it governs exactly one decision: **FIGHT vs FLEE**, and only
once `stateMachine.js`'s hard rules have already ruled out anything
unsafe (critical health, unarmed, a mob type with 2+ prior losses to it).
Nothing about this lets the RL layer talk the bot into a fight it
shouldn't take — it only gets a vote once the hard-coded safety net has
already said "either choice is survivable here."

- **State**: `(healthBucket, toolTier, hostileCategory)` — e.g.
  `high|iron|easy` — collapsing the continuous/combinatorial real state
  into a small discrete table (see `healthBucket`/`classifyHostileCategory`
  in `qlearning.js`).
- **Actions**: `FIGHT`, `FLEE`.
- **Reward** (computed in `src/index.js`'s `resolvePendingQUpdate`, one
  tick after the decision, once the outcome is visible): the health lost
  or gained since the decision, plus a bonus if the encounter resolved
  (mob defeated while fighting, or successfully disengaged while
  fleeing), or a firm −20 if FruitFly died before the next tick — this is
  what stops the death-during-combat case from being scored as a
  misleadingly positive health jump on respawn.
- **Bootstrapping**: if the same hostile is still engaged next tick, the
  update bootstraps off `max(Q(s', FIGHT), Q(s', FLEE))` for the
  resulting state; if the encounter ended, it's treated as terminal (no
  future value to add).
- **Persistence**: the whole Q-table lives in `memory.json` under
  `qlearning` and survives restarts, so it keeps improving across
  sessions like everything else here.

`test/qlearning.test.js` covers the bucketing, the epsilon-greedy
selection (both the exploit and explore branches), and the Bellman update
arithmetic directly; `test/stateMachine.test.js` covers that the hard
safety rules still win even when the Q-table strongly prefers the unsafe
option.

**Honest limits.** A 3-dimensional discretized table with two actions is
about as small as real RL gets — it's genuinely temporal-difference
learning, not a rebrand of the bandit, but it's also not going to
discover novel combat tactics; it can only learn *when* fighting a
category of mob at a tool/health level has paid off versus not, within
the two moves it's given. Scaling this to more actions, a richer state
(position, mob distance, armor), or a function approximator (a small
neural net instead of a table) instead of hand-picked buckets is real
follow-on work, not something already done here.

### Always armed, always fed

Two standing rules run on every tick, independent of whatever else is
going on, once the bot has bootstrapped basic tools:

- **Weapon**: if a crafting table has been used before but no weapon
  (sword or axe) is currently in inventory — lost, broken, given away,
  whatever — the very next thing it does is craft/equip one (best
  available tier), before resuming farming/building/exploring.
- **Food**: it doesn't wait to get hungry. Once food reserves drop below
  a learned stockpile target (default 6 units, rising after a starvation
  death), it proactively harvests the farm or hunts nearby passive mobs
  (cows/pigs/chickens/sheep/rabbits) to top back up. Raw meat gets cooked
  in the furnace when one's available, since it's edible either way but
  cooked is strictly better nutrition per inventory slot.

## Dataset

Every decision tick is appended to `data/episodes/<session>.jsonl` — see
[`data/README.md`](data/README.md) for the exact schema. Run
`npm run analyze` (wraps `scripts/analyze_dataset.py`) to summarize what's
been collected so far, or export a cleaned `(state, action)` table:

```bash
python3 scripts/analyze_dataset.py --export training_data.jsonl
```

## Testing

```bash
npm test
```

60 unit tests cover the state machine's full decision priority ordering
(including tuning-driven thresholds, weapon/food maintenance, and the
Q-learning combat delegation), the death-cause classification and
threshold-retuning in `lessons.js`, the Q-learning bucketing/selection/TD
update math in `qlearning.js`, the bandit's exploration/exploitation
behavior, the city planner's spiral allocation and persistence, and
blueprint loading/validation. These don't
require a Minecraft server — only the mineflayer-facing code
(`executors.js`, `perception.js`, `index.js`) needs a live connection to
exercise, since it's a thin, deliberately separated layer over the tested
decision logic.

## Roadmap: turning the dataset into a trained policy

"Build the largest dataset possible to train it to play Minecraft as a
professional human" is a real, multi-stage project beyond what a single
coding session can deliver — being upfront about that:

1. **Run it for real, a lot.** The logging infrastructure exists; the
   dataset itself only grows by actually running FruitFly against real
   worlds for many hours/days across varied terrain and situations.
   "Largest possible" is a function of wall-clock play time, not code.
2. **Behavior cloning first.** With enough logged `(state, action)` pairs,
   train a classifier (e.g. a small PyTorch MLP or gradient-boosted trees)
   to imitate the rule-based policy — a useful sanity check and a base for
   the next step, but it can't exceed the scripted policy it's imitating.
3. **Reward-driven fine-tuning / offline RL.** Use the logged `reward`
   field with an offline-RL method (e.g. CQL, or online fine-tuning against
   a real/simulated server) to actually improve on the scripted baseline —
   this needs real training compute and careful evaluation, not something
   to hand-wave as done.
4. **Human-level comparison.** "Professional human" is a high, specific
   bar (see MineRL/MineDojo competition baselines) — claiming it requires
   an actual benchmark, not a description in a README.

This repo gives you a solid, tested foundation (working agent + logging
infrastructure + reward function) to start stage 1 from.

## Known limitations

- **Untested against a live server** in this sandbox (no Minecraft server
  or account available here). Syntax-checked and unit-tested at the logic
  layer; the network/executor layer should work as written against
  standard mineflayer APIs but expect to debug edge cases against your
  actual server/version.
- **Terrain leveling is not implemented.** Blueprint placement skips
  blocks it can't find a solid reference for rather than terraforming a
  flat pad first — expect imperfect builds on uneven ground.
- **No automatic reconnect.** On disconnect/kick/crash, the process exits;
  wrap it in a restart loop (`while true; do npm start; sleep 5; done`) or
  a process manager (pm2, systemd) for unattended long runs.
- **Combat is simple melee**, not sophisticated PvE tactics (no shield
  blocking, no ranged weapons, no mob-specific strategy).
- **Sleeping requires a bed** to have been placed and remembered; the
  starter house blueprint doesn't currently place one, so at night the
  bot holes up and waits rather than true-sleeping through the night
  unless you extend the blueprint/build logic to place and register a bed.
