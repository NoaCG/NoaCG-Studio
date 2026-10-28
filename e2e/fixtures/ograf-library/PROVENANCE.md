# Foreign OGraf packages for the library (E3.1)

Two packages NoaCG did not write, by two authors, each under a licence that allows committing
them. Each `package/` folder is the upstream folder's files exactly as published (the bytes are
never edited; `.gitattributes` keeps checkouts from rewriting line endings). The tests read them
from here and never fetch them.

| Fixture | Author | Licence | Upstream | Why it is here |
| --- | --- | --- | --- | --- |
| `ebu-scoreboard` | European Broadcasting Union (EBU) | MIT (`ebu-scoreboard/LICENSE`) | `https://github.com/ebu/ograf` at `c821671195a077be13bbb96989d4220eea157b99` (the pinned standard), `v1/examples/scoreboard/` | action-rich: five steps, two custom actions, a thumbnail |
| `nytamin-live-poll` | Johan Nyman ("OGraf Templates") | MIT (`nytamin-live-poll/LICENSE`) | `https://github.com/nytamin/ograf-graphics` at `74c8eb80e22fb98165c10b942f1dd6b0fcc3dfb0`, `graphics/news/live-poll/` | nested data: a list of objects, non-real-time support, a manifest that is not named after its main |

sha256 of every file:

| File | sha256 |
| --- | --- |
| `ebu-scoreboard/package/README.md` | `d6fdcb289c324cccba4bcb846883f462fe095190402d6116f717c6da2f2deac0` |
| `ebu-scoreboard/package/graphic.mjs` | `2cc2e1c855a43ece121bb718d5c3bad7fbff6aa7b24297d5a0f3bfa8f50b09d7` |
| `ebu-scoreboard/package/scoreboard.ograf.json` | `ab835f78f4697af6c59753b9b4c8bc93c0d2076465c108d64d045524967f6f1c` |
| `ebu-scoreboard/package/thumbnail.webp` | `72aa6f6d77e6f03a2c6ae38a8de1e037d38bd9fd1e1858cd7a8a6963c4fbc02e` |
| `nytamin-live-poll/package/live-poll.js` | `b1643c55e610b15f57feed7ef8c45c26da071d2e01e65bbb5708e9cd512fff1c` |
| `nytamin-live-poll/package/manifest.ograf.json` | `bc98e66ac1ea46db309132cccd29a098d63d5f1968818a31f25f474a36c5647d` |

`hostile-dynamic` is NoaCG's own (written for `e2e/ograf-library.spec.ts`, not a downloaded
package): the isolation probes with every path out of its package built at run time.
