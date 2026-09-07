#!/usr/bin/env python3
"""CLI entry point for the Minecraft name sniper.

Usage:
    python3 main.py --config config.yaml
    python3 main.py --config config.yaml --check-only   # just print availability and exit
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

from name_sniper import mc_api
from name_sniper.auth import AuthError, MicrosoftMinecraftAuth
from name_sniper.sniper import NameSniper, SniperConfig


def _parse_utc(value) -> datetime:
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def load_config(path: str) -> SniperConfig:
    with open(path, "r") as f:
        raw = yaml.safe_load(f)

    drop_time_raw = raw.get("drop_time_utc")
    rename_detected_raw = raw.get("rename_detected_utc")
    cooldown_days = float(raw.get("cooldown_days", 37))

    if drop_time_raw and rename_detected_raw:
        raise ValueError(
            "Set only one of drop_time_utc / rename_detected_utc in config.yaml, not both."
        )

    drop_time = None
    if drop_time_raw:
        drop_time = _parse_utc(drop_time_raw)
    elif rename_detected_raw:
        rename_time = _parse_utc(rename_detected_raw)
        drop_time = rename_time + timedelta(days=cooldown_days)
        print(
            f"Computed drop time: {rename_time.isoformat()} + {cooldown_days:g} day "
            f"cooldown = {drop_time.isoformat()}"
        )

    return SniperConfig(
        client_id=raw["client_id"],
        target_name=raw["target_name"],
        drop_time_utc=drop_time,
        pre_drop_window_seconds=float(raw.get("pre_drop_window_seconds", 120)),
        post_drop_grace_seconds=float(raw.get("post_drop_grace_seconds", 900)),
        far_poll_interval=float(raw.get("far_poll_interval", 30)),
        near_poll_interval=float(raw.get("near_poll_interval", 0.5)),
        claim_attempts=int(raw.get("claim_attempts", 60)),
        claim_retry_delay=float(raw.get("claim_retry_delay", 0.1)),
        token_cache_path=raw.get("token_cache_path", "token_cache.json"),
    ), raw.get("log_path", "sniper.log")


def setup_logging(log_path: str) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(log_path)],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Minecraft name sniper")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Authenticate, check the target name's availability once, print it, and exit.",
    )
    args = parser.parse_args()

    if not Path(args.config).exists():
        print(
            f"Config file '{args.config}' not found. Copy config.example.yaml to "
            f"{args.config} and fill it in first.",
            file=sys.stderr,
        )
        return 1

    config, log_path = load_config(args.config)
    setup_logging(log_path)

    try:
        if args.check_only:
            auth = MicrosoftMinecraftAuth(config.client_id, config.token_cache_path)
            token = auth.get_minecraft_token()
            result = mc_api.check_name_available(token, config.target_name)
            print(result.body)
            return 0

        sniper = NameSniper(config)
        claimed = sniper.run()
        return 0 if claimed else 1
    except AuthError as e:
        logging.getLogger("name_sniper").error("Auth error: %s", e)
        return 1
    except KeyboardInterrupt:
        logging.getLogger("name_sniper").info("Interrupted by user.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
