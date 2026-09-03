# NVIDIA driver settings for RTX 5060

Open NVIDIA Control Panel → Manage 3D Settings → Program Settings → add
`javaw.exe` (and your launcher's exe) as a program-specific profile, then set:

| Setting | Value | Why |
|---|---|---|
| Power management mode | Prefer maximum performance | Stops the GPU from clocking down between frames during CPU-bound stretches (very common in Minecraft). |
| Low Latency Mode | Ultra (or On) | Reduces the render queue depth, cutting input lag and smoothing frame delivery. |
| Vertical sync | Off | Let Minecraft's own frame cap (or none) control pacing; driver-level vsync just adds latency. Use G-Sync/G-Sync Compatible instead if your monitor supports it. |
| Max Frame Rate | Off, or match your monitor's refresh rate | Only cap here if you want a hard limiter independent of Minecraft's in-game slider. |
| Texture filtering — Quality | High performance | Minecraft's textures are simple; there's no visible quality loss but it avoids unnecessary GPU work. |
| Threaded optimization | On | Lets the driver use extra CPU threads — the 12400K's 12 threads have headroom for this. |
| Shader Cache Size | Unlimited / Driver default | Avoids shader recompilation stalls if you use Iris + shader packs. |

## G-Sync / monitor sync

If your monitor supports G-Sync or G-Sync Compatible (FreeSync), enable it
in NVIDIA Control Panel → Display → Set up G-SYNC, and leave in-game vsync
off. This gives you tear-free output without the input-lag cost of vsync,
and works well alongside Minecraft's uncapped/high framerate setting.

## GeForce Experience / app overlays

Disable the in-game overlay (Alt+Z) and background recording (Instant
Replay) while playing if you're chasing maximum FPS — both consume CPU
cycles the 12400K would otherwise spend on Minecraft's tick/render loop.
