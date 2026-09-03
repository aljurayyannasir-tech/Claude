# OS-level tuning (Windows)

Minecraft is bottlenecked by single-thread CPU performance far more often
than by the GPU on this hardware, so OS scheduling and background load
matter a lot.

## Power plan

Set Windows to **High performance** (or **Ultimate Performance** if
available): Settings → Power & battery → Power mode, or via
`powercfg /list` + `powercfg /setactive <GUID>`. This stops Windows from
downclocking the 12400K between bursts of load, which otherwise shows up
as stutters when new chunks load.

## Process priority / core affinity

Not required for the 12400K (6 cores/12 threads is plenty), but if you're
running other CPU-heavy background tasks:

- Task Manager → Details tab → right-click `javaw.exe` → Set priority →
  **Above normal** (avoid "High"/"Realtime"; those can starve system
  processes and cause instability).
- Leave core affinity alone — the 12400K has no E-cores to schedule around,
  so manual affinity pinning provides no benefit here (unlike on
  E-core/P-core hybrid CPUs).

## Background load to close/disable while playing

- Web browsers with many tabs (each tab is a process/thread competing for
  scheduler time and RAM bandwidth).
- Discord/OBS hardware-accelerated overlays.
- Windows Game Bar / Xbox overlay (Settings → Gaming → Xbox Game Bar → Off)
  — it hooks the game process and adds overhead.
- Antivirus real-time scanning exclusion for your `.minecraft` folder and
  Java install directory, so file access during world save/chunk load
  isn't scanned on every read/write.

## Game Mode

Windows "Game Mode" (Settings → Gaming → Game Mode) can help by
deprioritizing background work, but has occasionally been reported to cause
stutter on some driver/CPU combos. Test with it on and off — if you notice
stutter, turn it off.

## Storage

Install Minecraft (and worlds) on an SSD if not already — chunk generation
and world save/load are disk-bound operations that stutter badly on HDDs.
