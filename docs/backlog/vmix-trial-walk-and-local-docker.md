---
v: 2
source: owner
kind: ask
raised: 2026-09-29
state: unstarted
asked: "vMix is running on a 60-day trial; during it, try the browser source in vMix and how NoaCG works with vMix, and be compatible with vMix in every way we can. Docker is installed too, for us to use when it helps (paraphrase, dictated; 'router source' read as browser source)"
serves: NOW
needs-owner: none
---

# Prove NoaCG in real vMix before the trial ends, and use the local Docker

**Filed:** 2026-09-29. **Source:** owner, in a session that installed and checked both tools on
the development desktop.

## Why

vMix is one of the most common playout environments NoaCG users run, and `docs/GOALS.md` outcome 5
still reads "vMix exports exist but are unproven in vMix". Its done criterion is a
production-realistic vMix walk: browser input, take, update, out, several layers. The owner
installed a vMix trial on 2026-09-29, so that walk can now happen on real vMix. **The trial runs
out around 2026-11-28**, and after that the walk needs a licence.

Docker was installed the same day. It unblocks two things that already stalled on its absence: the
real round against SuperFly.tv's `ograf-server`, which ships only as a Docker image
(`bridge-ograf-adapter.md`, `docs/OGRAF_ECOSYSTEM.md` §1a), and a local Supabase stack for the
configured suite (`hosted-cold-boot-specs-still-stick-for-their-whole-timeout.md`).

## What it would take

- **vMix walk.** vMix 29 (Trial) runs on the desktop with its HTTP API on `http://127.0.0.1:8088/api`
  and its TCP API on port 8099, so an agent on this machine can add a Browser input pointed at a
  NoaCG output and drive take, update and out itself (`Function=...` calls), then check the result.
  Cover several layers and the existing vMix exports. Record what vMix does differently from OBS
  and CasparCG, and file each gap as its own item.
- **Docker.** Docker Desktop 4.93 is installed per user in
  `%LOCALAPPDATA%\Programs\DockerDesktop`, and its `resources\bin` is on the user PATH (a shell
  started before the install needs a restart to see it). Before it can run containers, WSL has to
  be installed, which needs an administrator shell and a reboot:
  `wsl --install --no-distribution`. Then Docker Desktop starts its Linux engine on its own.

## Evidence

- 2026-09-29: `GET http://127.0.0.1:8088/api` answered `version=29.0.0.49 edition=Trial`, two blank
  inputs.
- 2026-09-29: `docker version` printed client 29.8.1; the engine did not start. Docker's backend log:
  `engine linux/wsl failed to start: checking preconditions: WSL update required`, because
  `wsl.exe --version` only prints the install help on this machine (WSL is not installed).
