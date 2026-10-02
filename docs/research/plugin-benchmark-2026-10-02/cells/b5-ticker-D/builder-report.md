# b5-ticker-D builder report (condensed)

Opus subagent, 236k tokens, 65 tool calls, 13.8 min. Package `radio-kaiku-ticker` from
`scaffold --type ticker --design tk10`, switched by hand from a rotator to the runtime's unused
marquee.

- Look, by its account: a dark night-blue strip in title-safe at the bottom, 64px tall, a warm
  amber label chip (UUTISET), headlines crawling right to left at 96 px/s with an amber dot
  between them and edge fades; no flashing. Urgent bulletin: the strip fades to red, the chip
  turns white with HUOMIO, the line holds still until cleared; the crawl keeps its place
  underneath.
- Operator surface: Headlines (one per line), Label, Urgent bulletin; buttons Show urgent bulletin
  (sends the bulletin text) and Clear bulletin; the bulletin chip word and an on/off holder as
  hidden data sources. An on-air headline edit keeps the crawl position (its own headless check).
- Validate: 0 errors, 0 warnings.
- Friction it reported: all seven ticker designs are rotators, the marquee exists in the runtime
  but no design uses it; any arrow in the main group kills a marquee in that group's timeline, so
  the bulletin had to be a parallel group (undocumented); recovery snap kills the crawl; a stale
  data resend cleared the bulletin under contract §5c's reported-field pattern (bench caught it);
  no CLI way to test an update during air (built a throwaway page); `--at` units; `scaffold
  --help` prints the global help; an unexplained `noacgTextOverflow` hook.
