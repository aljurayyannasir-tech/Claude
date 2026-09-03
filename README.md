# Minecraft FPS Optimizer — i5-12400K + RTX 5060

A practical toolkit for maxing out Minecraft: Java Edition FPS on a
**Core i5-12400K + RTX 5060** rig. Minecraft (even with Sodium) is heavily
single-thread/CPU bound and lightly GPU bound, so the biggest wins here come
from JVM tuning, render settings, and performance mods — not GPU horsepower.
This toolkit covers all three, plus OS/driver tuning.

## What's in here

| Path | Purpose |
|---|---|
| `scripts/generate_jvm_flags.py` | Prints optimized JVM launch arguments sized to your installed RAM |
| `scripts/apply_options.py` | Backs up and patches your `options.txt` with FPS-oriented video settings |
| `scripts/launch_optimized.sh` | Linux/macOS launch wrapper using the generated JVM flags |
| `scripts/launch_optimized.bat` | Windows launch wrapper using the generated JVM flags |
| `config/options-fps.txt` | Reference `options.txt` snippet with recommended values |
| `docs/mods.md` | Recommended performance mods (Fabric) for this hardware |
| `docs/nvidia-settings.md` | NVIDIA Control Panel / driver settings for the RTX 5060 |
| `docs/windows-tuning.md` | OS-level tuning (power plan, process priority, background apps) |

## Quick start

1. **Install a mod loader + performance mods** — see `docs/mods.md`. This is
   the single biggest FPS win (Sodium alone commonly doubles+ FPS over
   vanilla rendering).
2. **Generate JVM flags** sized to your RAM:
   ```bash
   python3 scripts/generate_jvm_flags.py --ram-gb 16
   ```
   Paste the output into your launcher's "JVM Arguments" field (Vanilla
   Launcher: Installation → More Options → JVM Arguments; Prism/MultiMC:
   Instance Settings → Java).
3. **Apply the recommended video settings** to an existing instance:
   ```bash
   python3 scripts/apply_options.py --minecraft-dir "/path/to/.minecraft"
   ```
   This edits `options.txt` in place after writing a timestamped backup.
4. **Apply the OS/driver tuning** in `docs/windows-tuning.md` and
   `docs/nvidia-settings.md`.

## Why these choices for a 12400K + 5060

- **CPU (i5-12400K)**: 6 P-cores / 12 threads, no E-cores, high boost clock.
  Minecraft's main render/tick loop is single-threaded, so per-core speed
  matters far more than core count — this CPU is actually *excellent* for
  Minecraft. The optimizer avoids over-allocating heap (which increases GC
  pause times and *hurts* frame times) and instead focuses on low-pause
  garbage collection (G1GC with Aikar-style tuning).
- **GPU (RTX 5060)**: More than enough to push high FPS at 1080p/1440p once
  the CPU stops bottlenecking. Settings favor uncapped framerate, disabled
  vsync (use G-Sync/Fast Sync at the driver level instead), and simplified
  lighting/particles/fog that cost CPU time to compute, not just GPU time.
- **RAM allocation**: 6–8 GB heap is typically the sweet spot for a modded
  or vanilla client on this hardware. More isn't better — it just means
  longer (if less frequent) GC pauses. The script scales sensibly with
  detected RAM but caps allocation to avoid this pitfall.

## Notes

- These scripts only ever touch `options.txt` (with a backup) and print JVM
  flags — they never modify your Minecraft installation, mods, or world
  files.
- Settings assume Java Edition with a Fabric + Sodium-based setup for best
  results, but the JVM flags and OS tuning apply equally to vanilla or
  Forge/NeoForge.
