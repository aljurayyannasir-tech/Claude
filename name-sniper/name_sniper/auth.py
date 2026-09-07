"""Microsoft -> Xbox Live -> XSTS -> Minecraft authentication.

Implements the standard Microsoft device-code auth chain used by
third-party Minecraft launchers (documented at minecraft.wiki's
"Microsoft Authentication Scheme" page). No password ever touches this
code — the device-code flow only needs the user to visit a Microsoft URL
and enter a short code in their browser.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import requests

DEVICE_CODE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode"
TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
XBL_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate"
XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize"
MC_LOGIN_URL = "https://api.minecraftservices.com/authentication/login_with_xbox"

SCOPE = "XboxLive.signin offline_access"

XSTS_ERROR_MESSAGES = {
    2148916233: "This Microsoft account has no Xbox Live profile. Log into "
                "xbox.com once with it first, then retry.",
    2148916235: "Xbox Live is not available in this account's country/region.",
    2148916236: "This account needs adult verification (South Korea).",
    2148916237: "This account needs adult verification (South Korea).",
    2148916238: "This is a child account and must be added to a Family "
                "before it can be used.",
}


class AuthError(RuntimeError):
    pass


class MicrosoftMinecraftAuth:
    """Handles login + token caching/refresh for a single Microsoft account."""

    def __init__(self, client_id: str, cache_path: str = "token_cache.json"):
        self.client_id = client_id
        self.cache_path = Path(cache_path)
        self._cache: dict = {}
        self._load_cache()

    # -- cache -----------------------------------------------------------
    def _load_cache(self) -> None:
        if self.cache_path.exists():
            try:
                self._cache = json.loads(self.cache_path.read_text())
            except (json.JSONDecodeError, OSError):
                self._cache = {}

    def _save_cache(self) -> None:
        self.cache_path.write_text(json.dumps(self._cache, indent=2))

    # -- step 1: Microsoft device code flow ------------------------------
    def _device_code_login(self) -> dict:
        resp = requests.post(
            DEVICE_CODE_URL,
            data={"client_id": self.client_id, "scope": SCOPE},
            timeout=15,
        )
        resp.raise_for_status()
        device = resp.json()

        print("\nTo sign in, open this URL in a browser:")
        print(f"  {device['verification_uri']}")
        print(f"and enter this code:  {device['user_code']}\n")

        interval = device.get("interval", 5)
        expires_at = time.time() + device.get("expires_in", 900)

        while time.time() < expires_at:
            time.sleep(interval)
            token_resp = requests.post(
                TOKEN_URL,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "client_id": self.client_id,
                    "device_code": device["device_code"],
                },
                timeout=15,
            )
            payload = token_resp.json()
            error = payload.get("error")
            if error == "authorization_pending":
                continue
            if error == "slow_down":
                interval += 5
                continue
            if error:
                raise AuthError(
                    f"Microsoft login failed: {error} - "
                    f"{payload.get('error_description', '')}"
                )
            return payload

        raise AuthError("Device code expired before you signed in. Try again.")

    def _refresh_ms_token(self, refresh_token: str) -> Optional[dict]:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": self.client_id,
                "refresh_token": refresh_token,
                "scope": SCOPE,
            },
            timeout=15,
        )
        payload = resp.json()
        if "error" in payload:
            return None
        return payload

    def _get_ms_tokens(self) -> dict:
        cached = self._cache.get("ms")
        if cached:
            refreshed = self._refresh_ms_token(cached["refresh_token"])
            if refreshed:
                refreshed["obtained_at"] = time.time()
                self._cache["ms"] = refreshed
                self._save_cache()
                return refreshed
        payload = self._device_code_login()
        payload["obtained_at"] = time.time()
        self._cache["ms"] = payload
        self._save_cache()
        return payload

    # -- step 2: Xbox Live ------------------------------------------------
    @staticmethod
    def _xbl_authenticate(ms_access_token: str) -> dict:
        resp = requests.post(
            XBL_AUTH_URL,
            json={
                "Properties": {
                    "AuthMethod": "RPS",
                    "SiteName": "user.auth.xboxlive.com",
                    "RpsTicket": f"d={ms_access_token}",
                },
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT",
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # -- step 3: XSTS -------------------------------------------------------
    @staticmethod
    def _xsts_authorize(xbl_token: str) -> dict:
        resp = requests.post(
            XSTS_AUTH_URL,
            json={
                "Properties": {
                    "SandboxId": "RETAIL",
                    "UserTokens": [xbl_token],
                },
                "RelyingParty": "rp://api.minecraftservices.com/",
                "TokenType": "JWT",
            },
            timeout=15,
        )
        if resp.status_code == 401:
            body = resp.json()
            xerr = body.get("XErr")
            raise AuthError(XSTS_ERROR_MESSAGES.get(xerr, f"XSTS error {xerr}: {body}"))
        resp.raise_for_status()
        return resp.json()

    # -- step 4: Minecraft --------------------------------------------------
    @staticmethod
    def _minecraft_login(uhs: str, xsts_token: str) -> dict:
        resp = requests.post(
            MC_LOGIN_URL,
            json={"identityToken": f"XBL3.0 x={uhs};{xsts_token}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # -- public API -----------------------------------------------------
    def get_minecraft_token(self) -> str:
        """Return a valid Minecraft bearer token, refreshing/logging in as needed."""
        cached_mc = self._cache.get("minecraft")
        if cached_mc and cached_mc["expires_at"] > time.time() + 60:
            return cached_mc["access_token"]

        ms = self._get_ms_tokens()
        xbl = self._xbl_authenticate(ms["access_token"])
        xbl_token = xbl["Token"]
        user_hash = xbl["DisplayClaims"]["xui"][0]["uhs"]

        xsts = self._xsts_authorize(xbl_token)
        xsts_token = xsts["Token"]

        mc = self._minecraft_login(user_hash, xsts_token)
        self._cache["minecraft"] = {
            "access_token": mc["access_token"],
            "expires_at": time.time() + mc.get("expires_in", 86400),
        }
        self._save_cache()
        return mc["access_token"]
