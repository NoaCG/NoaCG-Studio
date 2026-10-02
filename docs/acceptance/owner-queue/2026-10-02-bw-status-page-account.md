---
kind: decision
date: 2026-10-02
needs: account
serves: now
---
# Set up the status page at status.noacg.studio

You chose an outside status page with a free tier. The service is **Better Stack, free plan**:
it is the only free option we found that serves the page on our own subdomain and also has
visitor subscriptions, scheduled maintenance, a badge and a JSON feed. The reasons, its limits
and the alternatives are in `docs/STATUS_PAGE.md`. The health endpoint the monitors call,
`https://noacg.studio/api/status`, is built; wait until it answers with JSON before step 4.

These steps need your account. About 20 minutes, no cost.

1. **Sign up** at <https://betterstack.com> on the free plan, as the organisation NoaCG Studio.
2. **Create the status page.** Name it NoaCG Studio, set the custom domain to
   `status.noacg.studio`, and in Advanced settings turn on "Let users subscribe to updates via
   e-mail and webhook" and "Automatically create status page updates for new incidents".
3. **Add the DNS record** in Vercel, Domains, `noacg.studio`, DNS Records (the domain's DNS is
   on Vercel): type `CNAME`, name `status`, value `statuspage.betteruptime.com`. Better Stack
   says it can take up to 72 hours to take effect.
4. **Add the 8 monitors** in the table under "The monitors" in `docs/STATUS_PAGE.md`: HTTP, GET,
   every 3 minutes. Then add them to the status page in the five groups under "What users see":
   Studio, Sign-in, Library and saved work, Realtime playout link, Bridge downloads.
5. **Tell an agent "the status page is set up".** It checks the page over HTTPS with every
   monitor green, and builds the landing-page indicator
   (`docs/backlog/status-indicator-on-the-landing-page.md`).

**One later choice, not needed now.** On the free plan, people can follow the page by RSS or JSON,
but e-mailing subscribers about a hand-written report is a paid feature ("Small Team plan
onward" in Better Stack's docs). If you want subscribers e-mailed, that is the one upgrade worth
paying for.

From branch `claude/bw-status-page`.
