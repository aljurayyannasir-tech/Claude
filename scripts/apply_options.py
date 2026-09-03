#!/usr/bin/env python3
"""Patch a Minecraft options.txt with FPS-oriented video settings.

Only the keys listed in RECOMMENDED_SETTINGS are touched; every other line
in the existing options.txt is preserved as-is. A timestamped backup is
always written first.
"""

import argparse
import datetime
import os
import sys

RECOMMENDED_SETTINGS = {
    "renderDistance": "10",
    "simulationDistance": "8",
    "maxFps": "260",
    "enableVsync": "false",
    "fboEnable": "true",
    "graphicsMode": "1",
    "ao": "1",
    "entityShadows": "false",
    "particles": "1",
    "biomeBlendRadius": "2",
    "guiScale": "2",
    "mipmapLevels": "4",
    "prioritizeChunkUpdates": "0",
    "renderClouds": "false",
    "fancyGraphics": "false",
    "smoothLighting": "false",
    "darkMojangStudiosBackground": "false",
}


def default_minecraft_dir() -> str:
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, "AppData", "Roaming", ".minecraft"),  # Windows
        os.path.join(home, "Library", "Application Support", "minecraft"),  # macOS
        os.path.join(home, ".minecraft"),  # Linux
    ]
    for path in candidates:
        if os.path.isdir(path):
            return path
    return candidates[-1]


def apply_settings(options_path: str, overrides: dict) -> tuple:
    with open(options_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    seen = set()
    new_lines = []
    changed = 0
    for line in lines:
        stripped = line.rstrip("\n")
        if ":" in stripped:
            key = stripped.split(":", 1)[0]
            if key in overrides:
                new_value = f"{key}:{overrides[key]}\n"
                if line != new_value:
                    changed += 1
                new_lines.append(new_value)
                seen.add(key)
                continue
        new_lines.append(line)

    added = 0
    for key, value in overrides.items():
        if key not in seen:
            new_lines.append(f"{key}:{value}\n")
            added += 1

    with open(options_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    return changed, added


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--minecraft-dir",
        default=None,
        help="Path to your .minecraft directory (auto-detected if omitted)",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip writing a backup before patching (not recommended)",
    )
    args = parser.parse_args()

    mc_dir = args.minecraft_dir or default_minecraft_dir()
    options_path = os.path.join(mc_dir, "options.txt")

    if not os.path.isfile(options_path):
        print(f"error: no options.txt found at {options_path}", file=sys.stderr)
        print(
            "Run Minecraft at least once, or pass --minecraft-dir explicitly.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not args.no_backup:
        timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = f"{options_path}.bak-{timestamp}"
        with open(options_path, "rb") as src, open(backup_path, "wb") as dst:
            dst.write(src.read())
        print(f"Backed up existing options.txt to {backup_path}")

    changed, added = apply_settings(options_path, RECOMMENDED_SETTINGS)
    print(f"Updated {options_path}: {changed} settings changed, {added} added.")
    print("Restart Minecraft (or reopen the video settings menu) to see the changes.")


if __name__ == "__main__":
    main()
