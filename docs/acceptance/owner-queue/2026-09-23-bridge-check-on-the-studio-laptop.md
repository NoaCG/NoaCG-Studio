---
kind: hardware
date: 2026-09-23
serves: now
---
# Ten minutes on the Windows laptop with CasparCG: the new Playout door with Bridge 0.4.1

Everything else was verified in the cloud. This is the one part that needs the real CasparCG
server and the Bridge on your laptop. Nothing about the Bridge changed, so this checks that the
new door reaches it.

## The route, under a minute

1. Start CasparCG, and `NoaCG-Bridge.exe` 0.4.1 (the one you already have; <https://noacg.studio/downloads>
   serves the same file).
2. <https://noacg.studio/app#/home/productions> - open a production. The header's **Playout** dot
   should be green within a few seconds; stop the Bridge and it turns amber ("Bridge not running"),
   start it again and it goes green.
3. Press **Playout**: the dialog's **Test connection** reports your CasparCG version.
4. Close it, press **Output links**, **Put on air**: the output appears on the configured channel.
   **Take off** clears it.
5. Press **← Back** and **Home** once each.

**What to look at.** Only whether any step differs from what it says. If the dot stays hollow with
a paired Bridge, note what the tooltip says.
