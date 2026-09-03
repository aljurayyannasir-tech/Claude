# Recommended performance mods

These target Fabric (recommended over Forge for pure performance right now).
Install [Fabric Loader](https://fabricmc.net/use/) + [Fabric API](https://modrinth.com/mod/fabric-api),
then add:

## Core (install all of these)

| Mod | What it does |
|---|---|
| [Sodium](https://modrinth.com/mod/sodium) | Rewrites the rendering engine. The single biggest FPS gain available — commonly 2-10x over vanilla rendering, and it's what actually lets the RTX 5060 stretch its legs. |
| [Lithium](https://modrinth.com/mod/lithium) | Optimizes game logic/tick loop (pathfinding, entity ticking, block updates) without changing behavior. Directly benefits the 12400K's fast single-core performance. |
| [Starlight](https://modrinth.com/mod/starlight) | Rewrites lighting engine. Removes chunk-load lighting lag spikes almost entirely. |
| [FerriteCore](https://modrinth.com/mod/ferrite-core) | Reduces memory usage, which reduces GC pressure/pause frequency. |
| [Krypton](https://modrinth.com/mod/krypton) | Optimizes network stack; helps on multiplayer servers. |

## Optional, situational

| Mod | What it does |
|---|---|
| [Iris](https://modrinth.com/mod/iris) | Adds shader support on top of Sodium, if you want shaders — costs GPU time the RTX 5060 can absorb, but will lower FPS vs. no shaders. |
| [ImmediatelyFast](https://modrinth.com/mod/immediatelyfast) | Speeds up immediate-mode rendering (GUI, some entity rendering) — helps particularly in GUI-heavy or entity-heavy scenes. |
| [Entity Culling](https://modrinth.com/mod/entityculling) | Skips rendering of entities that aren't actually visible; useful in bases/farms with lots of entities. |
| [ModernFix](https://modrinth.com/mod/modernfix) | Faster game startup and various memory/loading optimizations, most useful with a large modpack. |
| [C2ME](https://modrinth.com/mod/c2me-fabric) | Multithreads chunk generation/loading — very effective with a 12-thread CPU when exploring/generating new terrain. |

## Avoid stacking too many "do the same thing" mods

Sodium + Lithium + Starlight + FerriteCore is the tested, stable core
combination most performance guides converge on. Adding many overlapping
"optimization" mods beyond this increases the chance of mod conflicts
without meaningful extra FPS.

## OptiFine alternative note

If you rely on OptiFine-only features (some resource pack features, connected
textures, custom entity models), use OptiFine instead of Sodium — but expect
noticeably lower FPS and worse frame time consistency than Sodium+Lithium on
this hardware. Sodium has largely closed the feature gap via mods like
[Continuity](https://modrinth.com/mod/continuity) (connected textures) and
[Indium](https://modrinth.com/mod/indium) (Fabric Rendering API support).
