# ai/seal-user-own-provider-key-together

Rule: `ai/seal-user-own-provider-key-together`. Recorded 2026-09-24 on `account-privacy-followup` at 8a6e71d.

The account-isolation audit found the BYOK cookie (noacg_ai_keys, one year, Path=/api/ai) sealed the keys alone, so after one account saved a key, the next account to sign in on the same computer - or anybody signed out - generated on the first account's key and bill. The payload now carries a version and the owner; api/_lib/aiGateway.test.ts pins that another account, a signed-out caller and an unverified session all read no keys.
