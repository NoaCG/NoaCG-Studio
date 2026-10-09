# Share to Community packs (OPT-IN - only when the user asks to share)

Read this only when the user asked, in this conversation, to share, publish or submit a package
for others. Sharing sends it for review to NoaCG's public Community packs shelf. A NoaCG admin
reviews every pack before anyone else sees it, and the user can withdraw it at once under Your
packs on the shelf.

## Confirm once, then share

Sharing is the user's grant, not yours. Before the first share in a conversation, unless the
user's request already gave the shown name and accepted the licence, say both in one message
and wait for their yes:

> It will be shown as "<name>", under CC BY 4.0: anyone may use it in any show, with that name.
> You confirm you have the right to share its fonts and images.

The shown name is the user's free choice (a nickname is fine). Never fill it from their account,
email or real name. Ask once; do not repeat the question for a second share they asked for.

## The command

Sharing rides `noacg pack`: the same build puts the package on the user's Home and sends a copy
for review. It needs `--save`, so the user must be logged in (`noacg login`).

```
noacg pack ./opener ./strap ./scorebug --name "Pub Quiz Night" \
  --description "Questions, answers and scores for a pub quiz" \
  --save --share --license cc-by-4.0 --shown-as "Quizmaster K"
```

In the MCP tool: `pack` with `paths`, `name`, and
`share: { license: "cc-by-4.0", shownAs: "Quizmaster K", description: "<one line>" }`.

- `--license cc-by-4.0`, `--shown-as` (at most 60 characters) and `--description` (one line, at
  most 200 characters) are all required. Anything missing is refused before anything is sent.
- One graphic is shared as a pack of one.
- The shared copy carries no cues: a `--rundown` stays on the Home copy only.
- Packs shared from the CLI are at most 4 MB. A larger one is shared from the studio's
  Community packs shelf.

## What comes back

- **Sent**: "Sent "<name>" for review under CC BY 4.0, shown as "<name>"." Tell the user it is
  In review under Your packs on the Community packs shelf, where they can withdraw it.
- **Refused by the checks**: each finding names the graphic and the reason. The checks are the
  shelf's own: placeholder text, an outside font, two graphics with one name, and any request a
  graphic makes outside itself while it plays (an image from a CDN, a fetch, a web font). A
  community pack carries everything it shows: put the file in the graphic, or remove the
  request, then run the same command again. Nothing was sent, not even the Home copy.
- **Refused by the server**: its sentence says why (for example ten packs already waiting for
  review, or an account that cannot submit packs). Report it as it is. Nothing was sent.
- **Shared, but not sent to Home**: the share went through and the Home door refused. Do not
  share again; pack it again without sharing to put it on the user's Home.
