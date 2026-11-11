
### Audio observation rule clarified during review

Audio setup and playback need an observed unmuted player. Use the same strict audio-readiness condition in every Take observation that authorizes progress or success, including append and each cleanup readback. Clips retain their existing mute-independent behavior. Combine readiness with the stage's ordered list, selected occurrence, loop and playback checks.

Resume refuses before a mixer function when the current audio player is muted or its mute state cannot be confirmed. After Play, it requires the same selected occurrence, Running and audio readiness. An unconfirmed sent result is uncertain. Loop/Hold, Pause and list-emptying verify their own effects. Mute alone does not change the cue or instance. No operation automatically unmutes to recover.

Create the instance after observed Running and keep that proven partial effect when later cleanup fails. Explicit ER preserves refusal and vMix's text with the partial effect. A missing valid reply stops the action as uncertain. Neither path repeats a command or reverses a mixer action.

XML unmuted is one necessary observation. The required real-host proof still checks the audio output and settings that XML does not expose.
