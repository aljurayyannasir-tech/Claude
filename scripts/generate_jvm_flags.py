#!/usr/bin/env python3
"""Generate optimized JVM launch flags for Minecraft: Java Edition.

Tuned for low-latency, low-pause garbage collection (G1GC, Aikar-style
tuning) rather than raw heap size — on a fast per-core CPU like the
i5-12400K, GC pause time matters far more to frame time than heap size.
"""

import argparse
import shutil


def recommended_heap_gb(total_ram_gb: float) -> int:
    """Pick a sensible max heap size. More heap != more FPS in Minecraft;
    past a point it only makes GC pauses longer, not less frequent."""
    if total_ram_gb <= 8:
        return 3
    if total_ram_gb <= 16:
        return 6
    if total_ram_gb <= 32:
        return 8
    return 10


def build_flags(xmx_gb: int, xms_gb: int) -> list:
    return [
        f"-Xms{xms_gb}G",
        f"-Xmx{xmx_gb}G",
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=130",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
        # Helps JIT warm up faster on a high-clock 6-core/12-thread CPU.
        "-XX:CICompilerCount=4",
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ram-gb",
        type=float,
        default=None,
        help="Total system RAM in GB (auto-detected if omitted, when possible)",
    )
    parser.add_argument(
        "--xmx-gb", type=int, default=None, help="Override max heap size (GB)"
    )
    args = parser.parse_args()

    total_ram_gb = args.ram_gb
    if total_ram_gb is None:
        total_ram_gb = detect_ram_gb()

    if total_ram_gb is None:
        print("Could not auto-detect RAM; defaulting to a 16 GB profile.")
        print("Pass --ram-gb <value> to size flags to your actual system.\n")
        total_ram_gb = 16

    xmx = args.xmx_gb or recommended_heap_gb(total_ram_gb)
    xms = xmx  # fixed heap avoids resize pauses during gameplay

    flags = build_flags(xmx, xms)

    print(f"Detected/assumed RAM: {total_ram_gb:g} GB")
    print(f"Recommended heap: -Xms{xms}G -Xmx{xmx}G\n")
    print("JVM arguments (paste into your launcher):\n")
    print(" ".join(flags))


def detect_ram_gb():
    """Best-effort RAM detection without external dependencies."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1])
                    return round(kb / 1024 / 1024, 1)
    except (FileNotFoundError, OSError, ValueError):
        pass

    if shutil.which("sysctl"):
        import subprocess

        try:
            out = subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"], text=True
            ).strip()
            return round(int(out) / (1024**3), 1)
        except (subprocess.CalledProcessError, ValueError):
            pass

    if shutil.which("wmic"):
        import subprocess

        try:
            out = subprocess.check_output(
                ["wmic", "computersystem", "get", "TotalPhysicalMemory"],
                text=True,
            )
            for line in out.splitlines():
                line = line.strip()
                if line.isdigit():
                    return round(int(line) / (1024**3), 1)
        except subprocess.CalledProcessError:
            pass

    return None


if __name__ == "__main__":
    main()
