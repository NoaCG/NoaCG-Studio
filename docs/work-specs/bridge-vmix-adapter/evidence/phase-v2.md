# V2 vMix setup and production output

V1 was independently verified on `4dab8e67af7d76d2e7f2cd180e36d14df9d151b4`
(PR #2291, receipt comment 6722265444). To revert V2 after landing, open a PR
with `git revert -m 1 <V2 merge SHA>` through the queue.

V2 lets an operator pair, choose vMix and load or unload a published production's
Browser input on an overlay. Media controls and the media library belong to later
phases. vMix keeps control of Program, Preview and transitions.

## Rules

- The Bridge owns only a single new Browser key with the expected default hostname
  title after its acknowledged AddInput. No pre-existing key can become owned.
  The versioned store records an addition before the send. If the result was lost
  or readback ambiguous, no input is named, claimed or overlaid. The next addition
  on that vMix waits until a fresh XML reading can see an unowned matching Browser
  from the prior attempt. It starts from that full reading and leaves all prior
  keys alone. If no Browser appears, the operator can restart vMix and clear only
  the pending addition with the Bridge closed. vMix reports the Browser host, so a
  simultaneous same-host external AddInput is still indistinguishable in live XML.
- A key belongs to the vMix TCP port and the output URL with its display name
  removed. The store beside the Bridge token keeps the address as a digest and the
  Browser key. Load and Unload use that key only while vMix lists it as a Browser.
  An action durably forgets a missing or invalid key before any new addition.
  The store serializes updates across ports and commits each replacement as one
  file. Missing storage starts empty. Unreadable, corrupt or unsupported storage
  blocks writes. One Bridge instance owns the store for each local user.
- An acknowledged, unambiguous new key is kept before renaming or overlaying it.
  Failure to save sends neither command. If rename or overlaying later fails, a new
  explicit Load rechecks the kept key. An unanswered function is uncertain and
  never sent again as part of the same operation.
- A new Browser gets the first available `NoaCG <title>` name with suffixes starting
  at `(2)` when taken. The Bridge excludes its own key when checking names. It updates
  an owned input's name on Load and when Unload finds it on the chosen overlay.
  Unload rechecks ownership immediately before Out, including after a rename, and
  verifies that the channel leaves the key after its transition. Empty and foreign
  overlays receive no function. Input-addressing functions use keys.
- A production row derives on-air ownership from the Bridge's XML reading and its
  own output address. The Bridge reports ownership on a scoped state request
  without returning the address or the persisted map. A Bridge that advertises
  vMix can report status. The studio requires the new Bridge capability before
  it sends a vMix output verb because an older vMix adapter acts by title.
- Load requires a current overlay read. A foreign input requires confirmation
  naming that input and channel. Cancel sends nothing. The action carries the
  observed input key (or an empty overlay) for the Bridge to check against fresh
  XML immediately before it puts the Browser on air. A settings change invalidates
  confirmation. vMix does not offer a conditional overlay
  command, so an operator action between XML and that command remains possible.
- The current saved production choice is checked at dispatch, including the old
  CasparCG Put on air button and first Publish. First Publish only loads vMix
  after an explicit vMix choice, and requires the same overlay check as Load.

## Before implementation

The V1 source still matches and takes off an input by title in
`cli/src/playout/adapters/vmix.ts`. It has no vMix routes in the studio request
layer. Slice 1 records the existing greeting, version and edition, status errors,
port and overlay-count checks.

An owned blank vMix 29.0.0.49 probe showed that a new Browser input for a loopback
URL is titled `Browser 127.0.0.1` in the XML, with no URL attribute. The vMix
process was stopped by its own PID and both `last.vmix` and `user.config`
restored and verified by SHA-256. The vMix background service stayed running.

The independent rules review returned AGREE WITH CORRECTIONS. The rules above
include its storage, delayed addition, overlay readback and dispatch corrections.
A separate real vMix probe showed a nonce in the default title and reached the
actual URL with BrowserNavigate after Chromium was ready. The saved preset still
held the original marker URL, so the Bridge adds the actual output URL directly.
Both probes restored the two configuration files and verified their SHA-256 hashes.
