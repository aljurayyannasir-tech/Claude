"""Convenience links to third-party trackers, built from a target name."""
from __future__ import annotations

from urllib.parse import quote


def namemc_url(name: str) -> str:
    """NameMC's profile/history page for a name (drop estimates, past owners)."""
    return f"https://namemc.com/profile/{quote(name)}"
