"""Estimate the local clock's offset from the Mojang API server's clock.

Sniping a name at a precise instant only works if "now" agrees with the
server's "now". We can't hit an NTP endpoint on Mojang's infrastructure,
so instead we sample the HTTP `Date` response header a few times,
correcting for round-trip latency, and use the median offset.
"""
from __future__ import annotations

import statistics
import time
from email.utils import parsedate_to_datetime

import requests

PROBE_URL = "https://api.minecraftservices.com/minecraft/profile/lookup/name/notch"


def measure_offset(samples: int = 5) -> float:
    """Return seconds to ADD to local time to get server time (can be negative)."""
    offsets = []
    for _ in range(samples):
        sent = time.time()
        try:
            resp = requests.get(PROBE_URL, timeout=5)
        except requests.RequestException:
            continue
        received = time.time()
        date_header = resp.headers.get("Date")
        if not date_header:
            continue
        server_time = parsedate_to_datetime(date_header).timestamp()
        latency = (received - sent) / 2
        offsets.append(server_time + latency - received)
    if not offsets:
        return 0.0
    return statistics.median(offsets)


class SyncedClock:
    def __init__(self, samples: int = 5):
        self.offset = measure_offset(samples)

    def now(self) -> float:
        return time.time() + self.offset

    def resync(self, samples: int = 5) -> None:
        self.offset = measure_offset(samples)
