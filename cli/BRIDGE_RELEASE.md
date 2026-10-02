NoaCG Bridge is the small program that connects NoaCG Playout in your browser to a CasparCG
server on your studio network, so you can put a production on air and play the server's own
templates and clips without the CasparCG Client. Run it on the laptop you operate from. It
listens only on that machine and never exposes CasparCG to the internet.

## What changed

{{changes}}

## Install

1. Download the NoaCG Bridge `.exe` file below onto the laptop you operate from. There is nothing to
   install: the file is the whole program.
2. Double-click it. Windows warns once, because the file is not signed yet: click **More info**,
   then **Run anyway**. A black window opens; leave it open while you work.
3. Your browser opens a NoaCG page. Press **Pair this browser**, and if the browser asks whether
   the site may reach your local network, allow it. To use another browser, copy the link into it
   instead.
4. Enter the IP address of your CasparCG server and press **Connect**. NoaCG Bridge remembers the
   server and its channels, so the next browser you pair connects by itself and opens with the
   same setup.

To pair another browser later, press Enter in the NoaCG Bridge window and copy the new link into
it, or use the button for it in **Playout** settings. To put a production on air, open it and press
**Put on air** in its **Playout** panel. The channels and the layer NoaCG's output goes on are in
Playout settings. The guide, with what to do when something is not working:
https://noacg.studio/docs#casparcg-connect

Use Chrome or Edge. Safari does not let a web page reach a program on the same machine.

Making graphics from a coding agent or a terminal is a different tool, the NoaCG CLI, installed
from npm: https://www.npmjs.com/package/@noacg/cli
