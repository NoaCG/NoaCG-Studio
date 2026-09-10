---
kind: walk
date: 2026-09-10
because: scope
serves: now
---
# A graphic whose size the app does not offer now says so

On 2026-08-29 you screenshotted the editor showing `headline · 1920x1880 · 25 fps`. 1880 is not a
project format this app has ever offered. The number reached the header, the resolution chip and a
saved record without one word of complaint, because the function whose whole job is to answer this
had no callers anywhere in the app. It does now, at both ends: opening and saving.

## The route, under a minute

1. `/app`, and make any graphic (a catalog one off the wizard is fine).
2. Open the browser console on that page and paste:

   ```js
   const { useTemplateStore } = await import('/src/store/templateStore.ts');
   const s = useTemplateStore.getState();
   s.applyTemplate({ ...s.template, resolution: { width: 1920, height: 1880, label: '1920x1880' } });
   ```

   That is the only way to reach the state by hand - the wizard cannot produce 1880, which is
   half of why the original graphic is still unidentified.
3. Press **Save** (name it anything).

## What to look at

**In the topbar**, between the graphic's name and the save word: `⚠ 1920×1880 · 25 fps` in amber.
Hover it - the tooltip says `Unsupported project resolution 1920×1880.` and then what that costs.
**On the canvas**, the small format chip bottom-left of the toolbar carries the same warning with
an amber border. **Beside the Save button**, after the save: `Saved · unsupported format` instead
of the plain green `Saved`.

Then make an ordinary 1920×1080 graphic and look again: no glyph, no amber, and the topbar's
format line goes back to being hidden on a laptop-width window, which is what it has always done.

## What was decided, so you can overrule it

**Nothing refuses.** A graphic with an unknown format still opens, still renders, still saves and
still exports. Refusing to open it would lose your work and refusing to save it would strand you
mid-edit; what the app can actually tell is that a format is unknown, not that the document is
broken. So the fault is stated in three places you already look, and never in your way.

The one thing this deliberately does NOT do is offer to fix it. There is no format control for a
graphic that already exists - the picker only appears while you are creating one - so the tooltip
does not send you looking for a door that is not there. If you want the app to offer "put this on
1920×1080 for me", that is a real feature and it is not in this change.

The 12 September production is a room full of people saving graphics; before this, any of those
saves could have carried a size nothing here has been measured against, silently.
