# The Audience tab names Twitch and YouTube, and never names the join link

**Filed:** 2026-09-16. **Source:** the /docs worked-example session, writing
`/docs#audience-no-chat` for readers who have neither channel.

## What happens
The Audience tab's first panel under the bar is **Chat sources**, with a platform picker offering
Twitch and YouTube and a **Connect** button. It is the only intake the screen names.

The way almost everybody will actually collect messages - the public join page at
`noacg.studio/join/<name>` - is not on this screen at all. It lives on the Playout tab, behind the
**Links** popover, and that popover does not exist until the production is published
(`ProductionLinks.tsx:217`: an unpublished production draws **▶ Start production** instead).

There is one line that points at it, and it is shown only when there is nothing to do with it:
`ProductionAudienceWorkspace.tsx:675` renders "Live - viewers send from the audience link (Links
▸ Audience link)" precisely when `backend.simulate` is absent, which is the PUBLISHED case. An
unpublished production gets the **⟳ Simulate 3 arrivals** button in that slot and no sentence at
all, so the person who most needs telling is the one who is not told.

## Why it matters now
A follow-along session is a hall full of phones and no broadcast channel. On this screen the
product offers two things such a room does not have and hides the one it does.

## What it would take
The unpublished case needs a sentence in the same slot, saying that the audience link appears when
the production is published and that publishing is free. The published case could go further and
show the link itself, or a **Copy audience link** button, rather than directions to another tab -
the workspace already has the show record, so `joinSlug` is in hand.

Worth deciding at the same time whether **Chat sources** should sit below the round composer
instead of above it. It is intake plumbing for a minority, and it is currently the first thing on
the screen.

## Evidence
Driven on 2026-09-16 against the dev build. An unpublished production: `production-links-toggle`
renders zero times, `production-publish` renders once and is disabled (no backend on that build),
and the Audience tab shows Chat sources with no mention of a join link anywhere on it.
`/docs#audience-no-chat` works around this by telling the reader to publish first, which is the
right instruction and the wrong place for it to live.
