"""Thin wrapper around the two Mojang endpoints this tool needs."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import requests

NAME_AVAILABLE_URL = "https://api.minecraftservices.com/minecraft/profile/name/{name}/available"
NAME_CHANGE_URL = "https://api.minecraftservices.com/minecraft/profile/name/{name}"


@dataclass
class ApiResult:
    ok: bool
    status_code: int
    body: dict
    retry_after: Optional[float] = None


def _headers(mc_token: str) -> dict:
    return {"Authorization": f"Bearer {mc_token}"}


def check_name_available(mc_token: str, name: str, timeout: float = 10) -> ApiResult:
    """GET .../available -> {"status": "AVAILABLE" | "DUPLICATE" | "NOT_ALLOWED"}."""
    resp = requests.get(
        NAME_AVAILABLE_URL.format(name=name), headers=_headers(mc_token), timeout=timeout
    )
    body = _safe_json(resp)
    retry_after = _retry_after(resp)
    is_available = resp.status_code == 200 and body.get("status") == "AVAILABLE"
    return ApiResult(ok=is_available, status_code=resp.status_code, body=body, retry_after=retry_after)


def claim_name(mc_token: str, name: str, timeout: float = 10) -> ApiResult:
    """PUT .../profile/name/{name} -> renames your account to `name`."""
    resp = requests.put(
        NAME_CHANGE_URL.format(name=name), headers=_headers(mc_token), timeout=timeout
    )
    body = _safe_json(resp)
    retry_after = _retry_after(resp)
    return ApiResult(ok=resp.status_code == 200, status_code=resp.status_code, body=body, retry_after=retry_after)


def _safe_json(resp: requests.Response) -> dict:
    try:
        return resp.json()
    except ValueError:
        return {"raw": resp.text}


def _retry_after(resp: requests.Response) -> Optional[float]:
    value = resp.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None
