
### Media folder and player identity clarified during review

Bridge checks the existing selected path before a Take or Resume can expose, extend or start it. The path must still identify a file of the player's supported media kind under the current canonical folder. Refusal leaves Pause, Out and Clear available for recovery. Ending verifies the owned selection and path under the current folder before changing its mode.

The folder dialog opens and waits outside the mixer turn. Once it returns a choice, publish the saved folder inside the same per-port turn as player actions. An action already in that turn keeps one folder through its path checks and commands. The new choice applies to actions entering after it is saved.

A production-scoped vMix overlay reading uses the Browser setup independently of the player store. A general state reading still reports verified overlays when player setup cannot be read and omits the optional players. Media setup and actions retain their own storage error.

Use a saved player GUID or a unique confirmed shortTitle. A reserved display title without a confirmed shortTitle is ambiguous and authorizes neither a function nor creation of another player.
