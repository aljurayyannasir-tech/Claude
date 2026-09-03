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

## Building — you must fill in version numbers first

Requires JDK 21 and Gradle 8.x. This project doesn't ship a Gradle wrapper
binary — either use a system Gradle install, or generate one yourself:

```bash
gradle wrapper --gradle-version 8.8   # one-time, if you don't have Gradle installed globally
```

**Before running `./gradlew build`**, open `gradle.properties` and
`build.gradle` and replace every `REPLACE_ME` placeholder:

- `gradle.properties`: `yarn_mappings`, `loader_version`, `fabric_version`
- `build.gradle`: the `fabric-loom` plugin version (currently a guess:
  `1.9-SNAPSHOT`)

Get the real values from https://fabricmc.net/develop/ (select Minecraft
1.21.11) and the [Fabric API releases](https://modrinth.com/mod/fabric-api)
page for a build tagged 1.21.11. **This environment blocks
`fabricmc.net`, `meta.fabricmc.net`, and `modrinth.com` outright** (not
just the Maven artifact host — a straight `curl`/WebFetch to any of them
returns a network-policy block), so none of these values could be looked
up or verified here; `gradle build` fails immediately on the placeholder
plugin version, confirmed by running it.

Once the versions are filled in, the first build downloads Minecraft
1.21.11, Yarn mappings, and Fabric Loader/API — needs internet access, can
take several minutes. The compiled mod jar lands in
`build/libs/sword-pvp-trainer-1.0.0.jar`.

**Not build-verified.** Beyond the placeholder versions above, the source
itself (`DrawContext`-based HUD rendering, Java 21 target) was written and
reviewed against known Fabric API patterns for the 1.20.2→1.21.x
transition, but has not actually compiled anywhere yet. The riskiest single
line is the `HudRenderCallback` registration in `PvpTrainerClient.java` —
see the comment there for the `HudElementRegistry` fallback if Mojang's
1.21.x HUD-layering rework removed it by 1.21.11.

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/) for Minecraft 1.21.11.
2. Download [Fabric API](https://modrinth.com/mod/fabric-api) for 1.21.11
   into your `mods` folder — required, this mod depends on it.
3. Drop `sword-pvp-trainer-1.0.0.jar` into the same `mods` folder.
4. Launch the 1.21.11 Fabric profile.

## Targeting a different Minecraft version

Bump `minecraft_version`, `yarn_mappings`, `loader_version`, and
`fabric_version` in `gradle.properties`, and the `fabric-loom` plugin
version in `build.gradle`, to match your target (check
[Fabric's version list](https://fabricmc.net/develop/) for compatible
combinations), then rebuild. `WorldRenderEvents` (used by the hitbox
visualizer) has been stable across recent versions; `HudRenderCallback`
(the cooldown overlay) is the API most likely to have moved — see the note
above.
