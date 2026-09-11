# Actors

| Actor | Meaning |
|---|---|
| `first-owner` | Person opening a fresh standalone VibeFlare deployment before any user exists. |
| `member` | Existing authenticated VibeFlare user. |
| `owner` | Authenticated user with role `owner`. |
| `unauthenticated` | Browser/API client with neither valid app session nor accepted Cloudflare Access identity/API key. |

Authentication topology is part of the fixture. Standalone passkey/GitHub journeys must not be silently treated as Cloudflare Access journeys.
