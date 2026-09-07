"""Core scheduling/polling/claiming loop."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from . import mc_api
from .auth import MicrosoftMinecraftAuth
from .links import namemc_url
from .time_sync import SyncedClock

log = logging.getLogger("name_sniper")


@dataclass
class SniperConfig:
    client_id: str
    target_name: str
    drop_time_utc: Optional[datetime]
    pre_drop_window_seconds: float
    post_drop_grace_seconds: float
    far_poll_interval: float
    near_poll_interval: float
    claim_attempts: int
    claim_retry_delay: float
    token_cache_path: str


class NameSniper:
    def __init__(self, config: SniperConfig):
        self.config = config
        self.auth = MicrosoftMinecraftAuth(config.client_id, config.token_cache_path)
        self.clock: Optional[SyncedClock] = None

    # ------------------------------------------------------------------
    def run(self) -> bool:
        log.info(
            "Target: '%s' — NameMC: %s",
            self.config.target_name,
            namemc_url(self.config.target_name),
        )
        log.info("Authenticating with Microsoft/Xbox/Minecraft...")
        mc_token = self.auth.get_minecraft_token()
        log.info("Authenticated.")

        log.info("Syncing clock against api.minecraftservices.com...")
        self.clock = SyncedClock()
        log.info("Clock offset: %.3fs", self.clock.offset)

        if self.config.drop_time_utc is not None:
            self._wait_for_window()

        return self._poll_and_claim(mc_token)

    # ------------------------------------------------------------------
    def _wait_for_window(self) -> None:
        target_ts = self.config.drop_time_utc.timestamp()
        window_start = target_ts - self.config.pre_drop_window_seconds

        while True:
            now = self.clock.now()
            remaining = window_start - now
            if remaining <= 0:
                break
            sleep_for = min(remaining, 60)
            log.info(
                "%.0fs until tight-polling window opens (target %s UTC). Sleeping %.0fs.",
                remaining,
                self.config.drop_time_utc.isoformat(),
                sleep_for,
            )
            time.sleep(sleep_for)
            self.clock.resync()

        log.info("Entering tight-polling window.")

    # ------------------------------------------------------------------
    def _poll_and_claim(self, mc_token: str) -> bool:
        name = self.config.target_name
        target_ts = (
            self.config.drop_time_utc.timestamp() if self.config.drop_time_utc else None
        )

        overdue_warned = False
        while True:
            if target_ts is not None:
                now = self.clock.now()
                in_window = now >= target_ts - self.config.pre_drop_window_seconds
                overdue = now >= target_ts + self.config.post_drop_grace_seconds
                if in_window and not overdue:
                    interval = self.config.near_poll_interval
                else:
                    interval = self.config.far_poll_interval
                    if overdue and not overdue_warned:
                        log.warning(
                            "Drop time estimate (%s UTC) passed %.0fs ago with no "
                            "availability yet — the estimate was likely off (Mojang's "
                            "hold is 'at least' the cooldown, not exact). Reverting to "
                            "slow polling to avoid hammering the API pointlessly.",
                            self.config.drop_time_utc.isoformat(),
                            self.config.post_drop_grace_seconds,
                        )
                        overdue_warned = True
            else:
                interval = self.config.far_poll_interval

            result = mc_api.check_name_available(mc_token, name)

            if result.status_code == 401:
                log.info("Minecraft token expired mid-run, re-authenticating.")
                mc_token = self.auth.get_minecraft_token()
                continue

            if result.status_code == 429:
                wait = result.retry_after or interval
                log.warning("Rate limited checking availability, waiting %.1fs.", wait)
                time.sleep(wait)
                continue

            if result.ok:
                log.info("'%s' is AVAILABLE — attempting to claim now.", name)
                if self._attempt_claim(mc_token, name):
                    return True
                log.info("Claim attempts exhausted; someone else got it. Resuming polling.")

            time.sleep(interval)

    # ------------------------------------------------------------------
    def _attempt_claim(self, mc_token: str, name: str) -> bool:
        for attempt in range(1, self.config.claim_attempts + 1):
            result = mc_api.claim_name(mc_token, name)
            if result.ok:
                log.info(
                    "SUCCESS on attempt %d: claimed '%s'. Confirm at %s",
                    attempt,
                    name,
                    namemc_url(name),
                )
                return True

            if result.status_code == 401:
                log.info("Minecraft token expired mid-claim, re-authenticating.")
                mc_token = self.auth.get_minecraft_token()
                continue

            if result.status_code == 429:
                wait = result.retry_after or self.config.claim_retry_delay
                time.sleep(wait)
                continue

            if result.status_code == 403:
                # Name already taken again, or account not eligible right now.
                log.info(
                    "Attempt %d/%d: 403 (%s) — someone beat us to it or account is "
                    "ineligible (rename cooldown, etc).",
                    attempt,
                    self.config.claim_attempts,
                    result.body,
                )
                return False

            log.info(
                "Attempt %d/%d failed: HTTP %d %s",
                attempt,
                self.config.claim_attempts,
                result.status_code,
                result.body,
            )
            time.sleep(self.config.claim_retry_delay)

        return False
