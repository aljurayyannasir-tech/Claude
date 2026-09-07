# Minecraft Name Sniper

Automates claiming a Minecraft (Java Edition) username the moment it becomes
available, using your own Microsoft account and the official Mojang/Xbox
APIs — the same ones every third-party launcher uses. No password handling,
no scraping, no touching anyone else's account: it logs in as *you* via
Microsoft's device-code flow, and races the official rename endpoint the
instant a name you want opens up.

## What it actually does

1. Signs you in with Microsoft's **device code** flow (you visit a
   `microsoft.com/link` URL and type a short code — this tool never sees
   your password).
2. Exchanges that for an Xbox Live token, then an XSTS token, then a
   Minecraft bearer token (the standard 4-hop chain Minecraft launchers use).
3. Syncs its clock against `api.minecraftservices.com`'s HTTP `Date` header
   so its timing lines up with the server's, not just your PC's clock.
4. Polls `GET /minecraft/profile/name/{name}/available` — slowly while
   far from the target time, then rapidly in a configurable window right
   before it.
5. The instant the name reports `AVAILABLE`, hammers
   `PUT /minecraft/profile/name/{name}` (the rename endpoint) with a burst
   of attempts until it succeeds or a competing claim wins.

## How the drop time actually works

When a Java account renames away from a name, Mojang holds that old name
for **at least 37 days** (a fixed, community-verified constant — "at
least" because Mojang can hold it longer, and it resets if the original
owner renames back) before anyone else can claim it. That's a real rule,
not a guess — the part that *is* unofficial is finding out exactly *when*
someone renamed away from a given name, because Mojang retired the public
name-history API (`/user/profiles/{uuid}/names`) in September 2022 for
privacy reasons. So:

- If you already know the rename timestamp (e.g. from NameMC's cached
  history for that account, or your own tracking), set
  `rename_detected_utc` + `cooldown_days` in `config.yaml` and the tool
  computes `drop_time_utc` for you.
- If you already have a drop time from elsewhere, set `drop_time_utc`
  directly instead.
- If a name became available for a different reason (account deletion,
  inactivity purge) there's no fixed rule at all — leave both blank and
  the tool just polls continuously.

Because the hold is "at least" the cooldown, not exact, the tool falls
back to slow polling (`post_drop_grace_seconds`) if the estimated time
passes with nothing happening, instead of hammering the API forever on a
guess that turned out to be early.

## What it cannot do

- It cannot take a name from an active account — this only works on names
  that are genuinely available, the instant they become so.
- It only ever authenticates as your own Microsoft account and only ever
  calls the rename endpoint for your own profile.

## Setup

### 1. Register a free Azure AD app (one-time)

Mojang's auth chain requires a Microsoft Entra (Azure AD) application ID
to identify the client making device-code requests. This is free and
takes two minutes:

1. Go to https://portal.azure.com → **App registrations** → **New registration**.
2. Name it anything, choose **"Personal Microsoft accounts only"** as the
   supported account type, leave Redirect URI blank.
3. After creation, copy the **Application (client) ID** from the overview
   page — that's your `client_id`. No client secret is needed (device
   code flow is a public-client flow).

### 2. Install dependencies

```bash
cd name-sniper
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

### 3. Configure

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml`:

| Field | Meaning |
|---|---|
| `client_id` | Your Azure app's client ID from step 1 |
| `target_name` | The exact name you want |
| `drop_time_utc` | ISO-8601 UTC timestamp of the expected drop, or leave blank to just poll continuously |
| `pre_drop_window_seconds` | How long before `drop_time_utc` to switch to fast polling |
| `far_poll_interval` / `near_poll_interval` | Seconds between availability checks, outside/inside that window |
| `claim_attempts` / `claim_retry_delay` | Burst size and spacing for the rename race once the name shows available |

`config.yaml` and `token_cache.json` are gitignored — they hold your
client id and cached auth tokens, never commit them.

### 4. Run

```bash
python3 main.py --config config.yaml
```

First run opens a device-code prompt in your terminal — visit the URL,
enter the code, sign in. After that, tokens are cached and refreshed
automatically (Minecraft tokens last ~24h; the Microsoft refresh token
lasts much longer), so subsequent runs won't ask again until it truly
expires.

To just check availability once without starting the full loop:

```bash
python3 main.py --config config.yaml --check-only
```

Everything is logged to both the console and the `log_path` from your
config (`sniper.log` by default), with timestamps, so you have a record
of exactly what happened around the drop.

## Notes and limits

- **Rate limits**: the tool backs off on HTTP 429 using the server's
  `Retry-After` header. Don't crank the poll intervals absurdly low —
  aggressive polling is more likely to get your requests throttled right
  when it matters, not less.
- **This is a race, not a guarantee.** If a name is popular, other bots and
  people are watching it too; whoever's request lands first on Mojang's
  side wins. Good clock sync and a tight `claim_attempts` burst are what
  this tool contributes — they don't guarantee the outcome.
- **Terms of Service**: automating requests against Mojang/Microsoft's
  APIs sits outside normal manual play, and aggressive automated polling
  can trip rate limiting or account-level scrutiny. Use reasonable
  intervals, keep this pointed only at your own account, and understand
  that name-sniping itself — while a long-standing community practice —
  is something Mojang could restrict at any time.
