# Sword PvP Trainer (Fabric mod)

A small client-side Fabric mod for practicing sword PvP timing with a
friend or against a dummy. It has two features:

1. **Cooldown overlay** — shows your held weapon's attack-cooldown progress
   as a bar under the crosshair, flashing "READY" the instant a swing would
   land at full strength/crit eligibility. Works anywhere, including on
   multiplayer servers — it only reflects your own weapon state, the same
   information vanilla's built-in crosshair attack indicator already shows.
2. **Hitbox + reach visualizer** — outlines nearby entities' hitboxes (red
   when they're within your melee range, yellow otherwise) and draws a ring
   around you at approximate reach distance. **Singleplayer/LAN-hosted
   worlds only** — it's disabled automatically the moment you're on a
   remote multiplayer server.

Both keybinds are unbound by default; set them in
**Options → Controls → Sword PvP Trainer**.

## What this mod deliberately does *not* do

No auto-attack, no aim assist, no automated clicking, no reach extension,
no anything that acts on your behalf. Everything here is a visual/info
overlay only — you still have to see the ready state and hit the timing
yourself. That's on purpose: the goal was to teach timing, and an
auto-clicker teaches nothing (and gets accounts banned on virtually every
server, since it's indistinguishable from a killaura to anti-cheat).

**Check server rules before using the hitbox visualizer anywhere but your
own singleplayer/LAN world** — most servers that allow client-side mods at
all still disallow hitbox reveals specifically, separate from cooldown
overlays which are usually fine (they mirror the vanilla attack indicator).

## Building

Requires JDK 21 and Gradle 8.x. This project doesn't ship a Gradle wrapper
binary — either use a system Gradle install, or generate one yourself:

```bash
gradle wrapper --gradle-version 8.8   # one-time, if you don't have Gradle installed globally
./gradlew build
```

The first build downloads Minecraft 1.21.11, Yarn mappings, and Fabric
Loader/API — needs internet access, can take several minutes. The compiled
mod jar lands in `build/libs/sword-pvp-trainer-1.0.0.jar`.

**Version numbers are verified, not guessed** — `gradle.properties` and the
`fabric-loom` plugin id/version in `build.gradle` were cross-checked against
FabricMC's own `fabric-example-mod` repo's `1.21.11` branch on GitHub
(loader `0.19.3`, Fabric API `0.141.6+1.21.11`, Loom plugin id
`net.fabricmc.fabric-loom-remap` version `1.17-SNAPSHOT` — note the plugin
id itself changed from the older `fabric-loom`) and FabricMC/yarn's tag
list for the latest published `1.21.11` mapping build (`build.6`). This
project keeps Yarn mappings rather than the newer
`loom.officialMojangMappings()` the current upstream template defaults to,
since official mappings rename essentially every vanilla class/method used
below (`PlayerEntity`→`Player`, `MinecraftClient`→`Minecraft`,
`DrawContext`→`GuiGraphics`, etc.) and this codebase wasn't written or
checked against those names.

**Still not build-verified end-to-end.** `gradle build` was actually run
against these exact version numbers here and got as far as confirming the
plugin id/version resolve correctly (Gradle searched Maven Central and the
Gradle Plugin Portal and correctly did *not* find them there — Fabric's
plugin is snapshot-only and lives solely on `maven.fabricmc.net`) before
failing, because this development sandbox's network policy blocks that
host outright (confirmed via a fresh 403 in the egress proxy's own log at
the exact moment of that attempt) — not something fixable from inside this
environment. On a normal machine with regular internet access this should
resolve fine. The one thing that couldn't be checked at all — because it
only surfaces once compilation actually runs — is the `HudRenderCallback`
registration in `PvpTrainerClient.java`; see the comment there for the
`HudElementRegistry` fallback if Mojang's 1.21.x HUD-layering rework
removed it by 1.21.11.

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/) for Minecraft 1.21.11.
2. Download [Fabric API](https://modrinth.com/mod/fabric-api) for 1.21.11
   into your `mods` folder — required, this mod depends on it.
3. Drop `sword-pvp-trainer-1.0.0.jar` into the same `mods` folder.
4. Launch the 1.21.11 Fabric profile.

## Targeting a different Minecraft version

Bump `minecraft_version`, `yarn_mappings`, `loader_version`, and
`fabric_version` in `gradle.properties`, and the `net.fabricmc.fabric-loom-remap`
plugin version in `build.gradle`, to match your target (check
[Fabric's version list](https://fabricmc.net/develop/), or the
`fabric-example-mod` GitHub repo's per-version branches, for compatible
combinations), then rebuild. `WorldRenderEvents` (used by the hitbox
visualizer) has been stable across recent versions; `HudRenderCallback`
(the cooldown overlay) is the API most likely to have moved — see the note
above.
