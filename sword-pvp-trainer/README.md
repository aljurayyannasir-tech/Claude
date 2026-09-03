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

Requires JDK 17 and Gradle 8.x. This project doesn't ship a Gradle wrapper
binary — either use a system Gradle install, or generate one yourself:

```bash
gradle wrapper --gradle-version 8.8   # one-time, if you don't have Gradle installed globally
./gradlew build
```

The first build downloads Minecraft 1.20.1, Yarn mappings, and Fabric
Loader/API — it needs internet access and can take several minutes. The
compiled mod jar lands in `build/libs/sword-pvp-trainer-1.0.0.jar`.

**Not yet build-verified.** The environment this mod was written in blocks
outbound access to `maven.fabricmc.net` (network policy, confirmed via a
403 on the CONNECT), so `gradle build` could not actually be run there —
the source was written and reviewed carefully against known Fabric API
patterns for 1.20.1, but hasn't compiled successfully anywhere yet. On your
first build, if the `fabric-loom` plugin version fails to resolve, check
the current stable version at https://fabricmc.net/develop/ (or search
`fabric-loom` on https://plugins.gradle.org/) and update the version in
`build.gradle`'s `plugins {}` block — `gradle.properties`'s
`yarn_mappings`/`loader_version`/`fabric_version` may need bumping to match
whatever's current too.

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/) for Minecraft 1.20.1.
2. Download [Fabric API](https://modrinth.com/mod/fabric-api) for 1.20.1
   into your `mods` folder — required, this mod depends on it.
3. Drop `sword-pvp-trainer-1.0.0.jar` into the same `mods` folder.
4. Launch the 1.20.1 Fabric profile.

## Targeting a different Minecraft version

Bump `minecraft_version`, `yarn_mappings`, `loader_version`, and
`fabric_version` in `gradle.properties` to match your target version (check
[Fabric's version list](https://fabricmc.net/develop/) for compatible
combinations), then rebuild. The rendering APIs used here
(`HudRenderCallback`, `WorldRenderEvents`) are stable across recent 1.20.x
releases, but HUD rendering changed from `MatrixStack` to `DrawContext`
starting around 1.20.2 — `CooldownOverlay.render` would need updating to
match if you target 1.20.2+.
