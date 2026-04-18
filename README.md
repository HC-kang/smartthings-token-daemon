# smartthings-token-daemon

A small Bun daemon that keeps a SmartThings OAuth refresh token on disk, refreshes access tokens before expiry, and exposes a local HTTP endpoint for callers that need a current access token.

## Why this exists

- Avoid redoing SmartThings OAuth in every caller.
- Keep refresh-token rotation logic in one place.
- Serve a short-lived access token to local tools over `127.0.0.1`.

## Endpoints

- `GET /healthz`
- `GET /token`
- `POST /refresh`

If `LOCAL_BEARER_TOKEN` is set, `/token` and `/refresh` require:

```text
Authorization: Bearer <LOCAL_BEARER_TOKEN>
```

## Local setup

1. Install dependencies.

```bash
bun install
```

2. Create `.env` from the example and fill in `SMARTTHINGS_CLIENT_ID` and `SMARTTHINGS_CLIENT_SECRET`.

```bash
cp .env.example .env
```

3. Obtain a SmartThings authorization code in the browser. Example authorize URL:

```text
https://api.smartthings.com/oauth/authorize?client_id=<CLIENT_ID>&response_type=code&scope=r:devices:*+x:devices:*&redirect_uri=https%3A%2F%2Fhttpbin.org%2Fget
```

4. Exchange the authorization code once and write `data/tokens.json`.

```bash
CODE="<authorization_code>" \
REDIRECT_URI="https://httpbin.org/get" \
bun run bootstrap
```

5. Start the daemon.

```bash
bun run start
```

6. Check the local endpoints.

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/token
```

## Docker Compose

```bash
docker compose up -d --build
docker compose logs -f
```

The service binds only to `127.0.0.1:8787`.

## Alerts

If `DISCORD_WEBHOOK_URL` is set, the daemon posts refresh failures to that Discord channel.

- `invalid_grant` alerts immediately because re-authorization is required.
- transient network or HTTP failures alert after 3 consecutive failures.

## Development

```bash
bun test
bun run typecheck
bun run dev
```

## Wrapper example

Use `scripts/st-exec.sh` to inject a fresh token into SmartThings CLI calls:

```bash
scripts/st-exec.sh devices
```

The script expects `curl`, `jq`, and `smartthings` to already exist on the host.
