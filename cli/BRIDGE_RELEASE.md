NoaCG Bridge is the small program that connects NoaCG Playout in your browser to a CasparCG
server on your studio network, so you can put a production on air and play the server's own
templates and clips without the CasparCG Client. Run it on the laptop you operate from. It
listens only on that machine and never exposes CasparCG to the internet.

## What changed

{{changes}}

## Install

1. Download `NoaCG-Bridge.exe` below onto the laptop you operate from. There is nothing to
   install: the file is the whole program.
2. Double-click it. Windows warns once, because the file is not signed yet: click **More info**,
   then **Run anyway**. A black window opens; leave it open while you work.
3. Your browser opens a NoaCG page. Press **Pair**, and if the browser asks whether the site may
   reach your local network, allow it.

Then, in NoaCG, open **Settings -> Playout**, fill in the CasparCG server's address, port, channel
and layer, and press **Test connection**. The guide, with what to do when something is not
working: https://noacg.studio/docs#casparcg-connect

Use Chrome or Edge. Safari does not let a web page reach a program on the same machine.

Making graphics from a coding agent or a terminal is a different tool, the NoaCG CLI, installed
from npm: https://www.npmjs.com/package/@noacg/cli
