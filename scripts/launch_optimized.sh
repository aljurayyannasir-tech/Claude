#!/usr/bin/env bash
# Launch Minecraft with optimized JVM flags.
#
# Usage:
#   ./launch_optimized.sh /path/to/minecraft-launcher [launcher-args...]
#
# JVM flags are auto-detected from system RAM (see generate_jvm_flags.py).
# This wrapper only exports the recommended flags via JAVA_TOOL_OPTIONS and
# then execs the given launcher — it does not replace your existing
# launcher or profile setup. Most users are better served by pasting the
# flags from generate_jvm_flags.py directly into their launcher's JVM
# Arguments field instead of using this wrapper.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 /path/to/minecraft-launcher [launcher-args...]" >&2
    exit 1
fi

LAUNCHER="$1"
shift

FLAGS="$(python3 "$SCRIPT_DIR/generate_jvm_flags.py" 2>/dev/null | tail -n 1)"
if [ -z "$FLAGS" ]; then
    echo "Failed to generate JVM flags" >&2
    exit 1
fi

echo "Using JVM flags: $FLAGS"
export JAVA_TOOL_OPTIONS="$FLAGS"

exec "$LAUNCHER" "$@"
