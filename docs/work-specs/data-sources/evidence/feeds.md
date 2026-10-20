# Q record: public feeds (gates C4)

Measured by the Q worker of the production-page plan run, 2026-10-20, 21:07 to 21:09 UTC, from a
Claude cloud session (Node 22.22.0 `fetch`, through the session's egress proxy), repository
revision `cc3500f2`. Spec: `../spec.md`, "Q. Qualification records" and AC-5/AC-6.

## Method

One plain GET per feed with `User-Agent: NoaCG-Q-measure/1`, then, where the response offered a
validator, one conditional GET sending it back (`If-None-Match`, and `If-Modified-Since` when a
`Last-Modified` was given). The bodies are saved under `feeds/` as fixtures for C4's Node tests.

The session's network allows only some hosts, so the five are the reachable ones that cover RSS
2.0 and Atom, CDATA, escaped HTML, a media namespace, feeds with and without validators, and
non-ASCII text. Refused by the proxy (not by the publisher): nasa.gov, news.ycombinator.com,
feeds.bbci.co.uk, en.wikipedia.org, feeds.feedburner.com, blog.python.org, github.blog,
stackoverflow.blog, theverge.com. C4's real-feed receipt should run where those hosts answer.

## Raw figures

| Fixture | Address | Format | Status, time | Bytes (full) | Items (full / kept) | Validator | Conditional GET | Cache headers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yle-paauutiset-rss.xml` | https://yle.fi/rss/uutiset/paauutiset | RSS 2.0 | 200, 410 ms | 9,556 (gzip) | 13 / 13 | weak ETag | 304, 0 bytes | `public, max-age=30`; `<ttl>5</ttl>` |
| `pypi-updates-rss.xml` | https://pypi.org/rss/updates.xml | RSS 2.0 | 200, 39 ms | 31,646 | 100 / 25 | strong ETag | 304, 0 bytes | none |
| `nodejs-blog-rss.xml` | https://nodejs.org/en/feed/blog.xml | RSS 2.0 | 200, 143 ms | 324,223 | 1,062 / 25 | none | not possible | `public, max-age=0, must-revalidate` |
| `github-node-releases-atom.xml` | https://github.com/nodejs/node/releases.atom | Atom | 200, 54 ms | 707,128 | 10 / 3 | weak ETag | 304, 0 bytes | `max-age=0, private, must-revalidate` |
| `youtube-channel-atom.xml` | https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw | Atom + `media:` + `yt:` | 200, 167 ms | 26,029 | 15 / 15 | none | not possible | `public, max-age=900` |

Two more were captured in the same run. `vercel-blog-atom.xml` is kept as a sixth fixture because
it is the only one with escaped markup in a title: https://vercel.com/atom (Atom, 3,914,056 bytes,
1,687 entries, weak ETag, 304 on the conditional GET). https://supabase.com/rss.xml (RSS 2.0,
166,436 bytes, 436 items, weak ETag plus `Last-Modified`, 304 when both were sent) is not kept.
None of the seven redirected.

Trimming: the RSS fixtures keep the channel header and the first 25 items (the reader shows the
newest 20). The GitHub fixture keeps entries 1, 3 and 5 of 10 (entry 2 alone is 157 KB; entry 5 has
an entity in its title). The Vercel fixture keeps entries 1 to 10 and entries 906, 1006 and 1022,
the ones whose titles hold `&amp;`, `&lt;script ...&gt;` and `-&gt;`. Each kept item is byte for byte as served, and each fixture parses as XML.

## Notes on markup

- **Yle (RSS 2.0, Finnish).** Plain-text titles, all 13 with non-ASCII characters (ä, ö, en
  dash), no entities, no CDATA. `guid isPermaLink="false"` carries the article address, while `<link>`
  adds `?origin=rss`: dedupe by guid, not by link. `<ttl>5</ttl>` asks for at most one read every
  5 minutes, which matches the planned 5-minute cache. The channel's `<copyright>` points to Yle's
  feed terms.
- **PyPI (RSS 2.0).** No `<guid>` in any item, so identity is the link (all 100 links distinct).
  Titles are plain; the only entities are `&amp;` and `&#39;` in descriptions.
- **Node.js blog (RSS 2.0).** Every title is CDATA (`<title><![CDATA[Node.js 24.22.0 (LTS)]]>`),
  so CDATA must come out as plain text. No ETag or Last-Modified: the reader cannot send a
  conditional request and has to rely on its own cache. 1,062 items in 324 KB: the reader must stop
  after the newest it needs or cap the size.
- **GitHub releases (Atom).** `<content type="html">` holds escaped HTML (`&lt;h3&gt;`, `&quot;`),
  and titles are plain text with commas and `@` handles, one with `&#39;` (entry 5:
`Version 22.23.3 &#39;Jod&#39; (LTS)`). Identity is a `tag:` URI in `<id>`. Ten
  entries weigh 707 KB, so a size cap set much below 1 MB refuses this feed. A body cut off at the
  cap is not well-formed XML, so C4 should refuse an oversized response and keep the last good
  list, and choose its cap knowing that ordinary feeds reach 1 MB.
- **Vercel blog (Atom).** Titles hold entities and escaped markup: `&lt;script
  type="text/llms.txt"&gt;`, `v0.dev -&gt; v0.app`, `Introducing AI agents &amp; services ...`.
  These must come out as the plain text `<script type="text/llms.txt">`, not as markup. 3.9 MB
  for the whole feed, the largest seen.
- **YouTube channel (Atom).** Default namespace Atom with `yt:` and `media:`; titles carry emoji
  (7 of 15); the description is in `media:group/media:description`, not in `<summary>`. No
  validator, but `max-age=900` asks for 15 minutes between reads.
- **Across all five.** Two of five offer no validator, so conditional requests help only some
  feeds; every feed that offered one answered 304 with an empty body. Weak ETags (`W/"..."`) work
  when sent back unchanged. Dates are RFC 822 in RSS (`Tue, 20 Oct 2026 19:52:24 +0300`) and RFC
  3339 in Atom.

## Judgement

The six fixtures give C4 what AC-5 needs: RSS 2.0 and Atom, CDATA titles, escaped markup and
entities in titles (Vercel, GitHub) and in content (GitHub), non-ASCII text and emoji, feeds with and without `<guid>`, and feeds with and without validators.
C4's polite reading (AC-6) should honour `<ttl>` and `max-age` as lower bounds on the 5-minute
cache, and must refuse feeds larger than its size cap without losing the last good list, because three
real feeds (Node.js blog, GitHub releases, Vercel blog) are large by default.
