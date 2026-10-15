// covers: api/_lib/me/connectorSend.ts, api/_lib/me/mcp.ts, api/_lib/me/packageShape.ts, src/packs/graphicsPack.ts
// covers: src/templates/types/recipeTemplate.ts, src/components/home/sections/ProductionsSection.tsx
//
// THE REMOTE MCP CONNECTOR'S SEND TOOL, on the runner's local stack (docs/REMOTE_MCP_PLAN.md,
// AC-4). A throwaway account A connects a scripted chat client (@modelcontextprotocol/sdk)
// through the real OAuth flow and sends ONE package: three catalog recipes, a copy of A's own
// graphic, A's brand (its logo stored in Storage, as the studio's sync leaves it), values from a
// run sheet and a rundown. Then, in a browser as A, Install on Home opens a production whose
// graphics carry those values and the brand, pass the gate, and play in a browser source. Every
// refusal - another account's graphic and brand, a malformed recipe, the waiting cap, the send
// budget - stores nothing. Last, a pack FILE with a recipe entry installs through Import.
//
// Local stack only: it registers OAuth clients, which hosted staging's Auth cannot do yet.

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { isConnectorTestStack } from '../../scripts/connector-oauth-spike.mjs';
import { publishProduction } from '../_publish';
import { mintAccount, SERVICE_ROLE_KEY, shot, signInOnHome, SUPABASE_URL, unpublishForCleanup } from './_helpers';
import { callTool, deleteOAuthClient, ScriptedClaude, signedInClient } from './_connector';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
/** A 1x1 PNG: the brand's mark. */
const LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ACCENT = '#1d4ed8';

interface IndexType {
  id: string;
  fields: Array<{ key: string; role?: string; kind: string; options?: string[] }>;
  designs: Array<{ id: string }>;
}

const now = () => new Date().toISOString();

/** A real catalog template, built by the studio's own recipe function in the page. */
async function realTemplate(page: Page, name: string, design: string) {
  return page.evaluate(async ({ n, d }) => {
    const { templateFromRecipe } = await import('/src/templates/types/recipeTemplate.ts');
    return templateFromRecipe({ type: 'lower-third', design: d, values: { name: 'Copy name', title: 'Copy title' } }, n);
  }, { n: name, d: design });
}

/** One account's own graphic and brand, through the service role as the studio's sync leaves
 *  them: the brand's logo is a Storage reference into the account's own folder. */
async function seed(admin: SupabaseClient, userId: string, label: string, template: unknown) {
  const graphic = randomUUID();
  const brand = randomUUID();
  const key = `${userId}/connector-send-logo`;
  const uploaded = await admin.storage.from('user-assets').upload(key, Buffer.from(LOGO_PNG, 'base64'), { contentType: 'image/png', upsert: true });
  if (uploaded.error) throw new Error(`upload: ${uploaded.error.message}`);
  const inserted = await admin.from('documents').insert([
    {
      id: graphic,
      user_id: userId,
      kind: 'graphic',
      name: `${label} sermon title`,
      deleted: false,
      body: { version: 1, id: graphic, name: `${label} sermon title`, type: 'lower-third', packageId: null, template, entries: [], activeEntryId: null, createdAt: now(), updatedAt: now() },
    },
    {
      id: brand,
      user_id: userId,
      kind: 'look',
      name: `${label} church`,
      deleted: false,
      body: {
        id: brand,
        name: `${label} church`,
        updatedAt: now(),
        brand: {
          styleTag: 'minimal',
          palette: { id: 'custom', name: `${label} blue`, styleTags: ['minimal'], accent: ACCENT, text: '#ffffff', textDim: '#cbd5e1', panel: '#0b1220' },
          fontId: 'inter',
          customFont: null,
          logo: { path: 'images/church-mark.png', data: `spx-storage:${key}` },
        },
      },
    },
  ]);
  if (inserted.error) throw new Error(`documents: ${inserted.error.message}`);
  return { graphic, brand };
}

test.describe('remote MCP connector: send a package', () => {
  test.setTimeout(300_000);

  test('a chat client sends one package that installs into a working, branded production; refusals store nothing; a recipe pack imports', async ({ page, request, baseURL, context }) => {
    test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
    test.skip(!isConnectorTestStack(SUPABASE_URL), 'local stack or the hosted test project named in NOACG_CONNECTOR_TEST_REF only: it registers OAuth clients');
    const origin = baseURL!.replace(/\/+$/, '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const stamp = Date.now();
    const accounts = ['a', 'b'].map((who) => ({ email: `connector-send-${who}-${stamp}@noacg.local`, password: `pw-${randomBytes(9).toString('base64url')}` }));
    const provider = new ScriptedClaude('Claude (scripted send)');
    const userIds: string[] = [];
    const waitingOf = async (userId: string) => {
      const { data, error } = await admin.from('agent_packages').select('id, name, origin, graphic_count').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data ?? [];
    };

    try {
      for (const account of accounts) userIds.push(await mintAccount(admin, account.email, account.password));
      const [userA, userB] = userIds;
      const index = (await (await request.get(`${origin}/catalog-index.json`)).json()) as { types: IndexType[] };
      const typeOf = (id: string) => {
        const t = index.types.find((x) => x.id === id);
        expect(t, id).toBeTruthy();
        return t!;
      };
      const lowerThird = typeOf('lower-third');
      const titleCard = typeOf('title-card');
      const logoBug = typeOf('logo-bug');
      await page.goto('/app#/home');
      const own = await seed(admin, userA, 'A', await realTemplate(page, 'A sermon title', lowerThird.designs[0].id));
      const foreign = await seed(admin, userB, 'B', await realTemplate(page, 'B sermon title', lowerThird.designs[0].id));
      const client = await signedInClient(request, origin, { url: SUPABASE_URL, anonKey: ANON_KEY }, accounts[0].email, accounts[0].password, provider);

      // tools/list: the send tool beside the read tools, titled, writing but not destructive.
      const { tools } = await client.listTools();
      const send = tools.find((t) => t.name === 'noacg_send_package');
      expect(send?.title).toBeTruthy();
      expect(send?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
      console.log(`connector send: tools/list is ${JSON.stringify(tools).length} characters for ${tools.length} tools`);

      // Three recipes from the catalog index: a lower third, a title card and a logo bug.
      const firstText = (t: IndexType) => t.fields.find((f) => f.kind === 'text' && f.role !== 'logo')?.key;
      const titleKey = firstText(titleCard);
      const args = {
        name: `Sunday service ${stamp}`,
        description: 'From the run sheet',
        brand: own.brand,
        graphics: [
          { name: 'Speaker', type: 'lower-third', design: lowerThird.designs[0].id, values: { name: 'Anna Andersson', title: 'Pastor' }, layer: 20 },
          { name: 'Sermon card', type: 'title-card', design: titleCard.designs[0].id, ...(titleKey ? { values: { [titleKey]: 'Grace and peace' } } : {}), layer: 30 },
          { name: 'Church bug', type: 'logo-bug', design: logoBug.designs[0].id, layer: 40 },
          { name: 'Sermon copy', graphic: own.graphic, layer: 25 },
        ],
        cues: [
          { graphic: 'Speaker', label: 'Anna', values: { name: 'Anna Andersson', title: 'Pastor' } },
          { graphic: 'Sermon card', label: 'Sermon', ...(titleKey ? { values: { [titleKey]: 'Grace and peace' } } : {}) },
          { graphic: 'Speaker', label: 'Ben', values: { name: 'Ben Berg', title: 'Reader' } },
          { graphic: 'Sermon copy', label: 'Copy', values: { f0: 'Lee', f1: 'Elder' } },
        ],
      };
      const sent = await callTool(client, 'noacg_send_package', args);
      expect(sent.isError, sent.content[0]?.text).not.toBe(true);
      // The link opens Home → Productions with this package selected (docs/AGENT_SAVE.md §9).
      const sentId = (sent.structuredContent as { id: string }).id;
      expect(sent.structuredContent).toMatchObject({ url: `${origin}/app#/home/productions/${sentId}`, graphics: 4, cues: 4 });
      const stored = await waitingOf(userA);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ name: args.name, graphic_count: 4, origin: { tool: 'noacg-connector', client: provider.info?.client_id } });
      console.log(`connector send: one waiting package ${stored[0].id} with origin ${JSON.stringify(stored[0].origin)}`);

      // Refusals, each with a sentence to act on, and each storing nothing.
      const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
        ['another account\'s graphic', { ...args, graphics: [{ name: 'Theirs', graphic: foreign.graphic }], cues: [] }, /own library/],
        ['another account\'s brand', { ...args, brand: foreign.brand }, /own brands/],
        ['a design of another type', { ...args, graphics: [{ name: 'Bad', type: 'lower-third', design: titleCard.designs[0].id }], cues: [] }, /is not a design of lower-third/],
        ['a value key the type lacks', { ...args, graphics: [{ name: 'Bad', type: 'lower-third', design: lowerThird.designs[0].id, values: { f0: 'x' } }], cues: [] }, /has no field "f0"/],
      ];
      for (const [what, bad, message] of refusals) {
        const answer = await callTool(client, 'noacg_send_package', bad);
        expect(answer.isError, what).toBe(true);
        expect(answer.content[0].text, what).toMatch(message);
      }
      expect(await waitingOf(userA)).toHaveLength(1);

      // The waiting cap: 25 waiting (one real, the rest seeded) and the next send is refused.
      const filler = Array.from({ length: 24 }, (_, i) => ({ user_id: userA, name: `Filler ${i}`, graphic_count: 1, origin: { tool: 'e2e' }, body: { format: 'noacg-pack', version: 1 } }));
      const filled = await admin.from('agent_packages').insert(filler);
      expect(filled.error).toBeNull();
      const capped = await callTool(client, 'noacg_send_package', args);
      expect(capped.isError).toBe(true);
      expect(capped.content[0].text).toMatch(/25 packages are already waiting.*install or dismiss/);
      await admin.from('agent_packages').delete().eq('user_id', userA).eq('origin->>tool', 'e2e');
      expect(await waitingOf(userA)).toHaveLength(1);

      // The send budget: every call counts, refused ones too; the next is refused with a wait.
      let limited: Awaited<ReturnType<typeof callTool>> | null = null;
      for (let i = 0; i < 12 && !limited; i += 1) {
        const answer = await callTool(client, 'noacg_send_package', { ...args, graphics: [] });
        if (/Too many packages/.test(answer.content[0]?.text ?? '')) limited = answer;
      }
      expect(limited?.isError).toBe(true);
      expect(limited?.content[0].text).toMatch(/Wait \d+ seconds/);
      expect(await waitingOf(userA)).toHaveLength(1);
      console.log('connector send: foreign ids, a malformed recipe, the waiting cap and the send budget each refused, nothing stored');

      // INSTALL on Home, in a browser, as A.
      await signInOnHome(page, accounts[0].email, accounts[0].password);
      await page.goto('/app#/home/productions');
      const row = page.getByTestId('waiting-packages').locator('.pack-waiting-row').filter({ hasText: args.name });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row).toContainText('4 graphics');
      await expect(row, 'a chat client is a connected app, not a coding agent').toContainText('sent from a connected app');
      await shot(page, 'connector-send-waiting-row');
      await row.getByTestId('install-waiting-package').click();
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('production-page')).toContainText(args.name);
      // The rundown in order, plus one default row for the bug the rundown never names.
      await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(5);

      const installed = await page.evaluate(async ({ name, brandId }) => {
        const { loadShows } = await import('/src/model/shows.ts');
        const { productionGateFailures } = await import('/src/validation/productionGate.ts');
        const { publishGate } = await import('/src/validation/publishGate.ts');
        const { loadGraphics } = await import('/src/model/library.ts');
        const show = loadShows().find((s) => s.name === name)!;
        const byId = new Map(show.graphics.map((g) => [g.id, g]));
        return {
          brandId: show.brandId ?? null,
          brandWanted: brandId,
          graphics: show.graphics.map((g) => ({
            name: g.name,
            layer: g.layer,
            accent: /--accent:\s*([^;]+);/.exec(g.template.css)?.[1]?.trim() ?? null,
            fields: g.template.fields.map((f) => ({ field: f.field, title: f.title, value: f.value })),
            hasMark: g.template.assets.some((a) => a.path === 'images/church-mark.png' && String(a.data).startsWith('data:image/png')),
            gate: publishGate(g.template, true).ok,
          })),
          productionFailures: productionGateFailures(show.graphics, loadGraphics()).map((f) => f.name),
          cues: (show.cues ?? []).map((c) => ({ graphic: byId.get(c.sourceId)?.name, label: c.label, values: c.values })),
        };
      }, { name: args.name, brandId: own.brand });
      console.log(`connector send: installed ${JSON.stringify({ ...installed, graphics: installed.graphics.map((g) => ({ ...g, fields: g.fields.length })) })}`);
      expect(installed.graphics.map((g) => g.name).sort()).toEqual(['Church bug', 'Sermon card', 'Sermon copy', 'Speaker']);
      expect(installed.productionFailures, 'the production gate refuses no graphic').toEqual([]);
      for (const g of installed.graphics) {
        expect(g.gate, `${g.name} passes the publish gate`).toBe(true);
        // Only a design that declares the accent can carry it (applyLookToTemplate writes no new var).
        if (g.accent !== null || g.name === 'Speaker') expect(g.accent?.toLowerCase(), `${g.name} carries the brand's accent`).toBe(ACCENT);
      }
      expect(installed.brandId, 'the production is in the brand').toBe(own.brand);
      const speaker = installed.graphics.find((g) => g.name === 'Speaker')!;
      expect(speaker.layer).toBe(20);
      expect(speaker.fields.slice(0, 2)).toEqual([
        expect.objectContaining({ field: 'f0', title: 'Name', value: 'Anna Andersson' }),
        expect.objectContaining({ field: 'f1', title: 'Title', value: 'Pastor' }),
      ]);
      // The card's lines the recipe left out are blank, not the design's sample text (a church's
      // card once aired "ELECTIONS 2026"). Lines come first, so they are f0..f(lines - 1).
      const lineCount = titleCard.fields.filter((f) => !f.role).length;
      const card = installed.graphics.find((g) => g.name === 'Sermon card')!;
      const leftOut = card.fields.filter((f) => /^f\d+$/.test(f.field) && Number(f.field.slice(1)) >= (titleKey ? 1 : 0) && Number(f.field.slice(1)) < lineCount);
      expect(leftOut.length, 'the title card has lines the recipe left out (its kicker among them)').toBeGreaterThan(0);
      expect(leftOut.map((f) => f.value), 'the lines a recipe leaves out are blank').toEqual(leftOut.map(() => ''));
      expect(installed.graphics.find((g) => g.name === 'Church bug')!.hasMark, 'the brand mark is in the logo bug').toBe(true);
      // The run sheet's values, by the SPX ids the logical keys compiled to (the studio fills the
      // rest of a cue from the graphic's defaults, the brand mark among them).
      expect(installed.cues.slice(0, 4)).toEqual([
        { graphic: 'Speaker', label: 'Anna', values: expect.objectContaining({ f0: 'Anna Andersson', f1: 'Pastor' }) },
        { graphic: 'Sermon card', label: 'Sermon', values: titleKey ? expect.objectContaining({ f0: 'Grace and peace' }) : expect.anything() },
        { graphic: 'Speaker', label: 'Ben', values: expect.objectContaining({ f0: 'Ben Berg', f1: 'Reader' }) },
        { graphic: 'Sermon copy', label: 'Copy', values: expect.objectContaining({ f0: 'Lee', f1: 'Elder' }) },
      ]);
      await expect.poll(async () => (await waitingOf(userA)).length, { timeout: 20_000 }).toBe(0);

      // PLAY in a browser source: publish, take the first cue, see it on the output.
      await publishProduction(page);
      await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
      const panel = page.getByTestId('production-status-panel');
      if (await panel.isVisible()) await page.getByTestId('production-status').click();
      const slugs = await page.evaluate(async (name) => {
        const { loadShows } = await import('/src/model/shows.ts');
        const show = loadShows().find((s) => s.name === name);
        return { output: show?.outputSlug ?? null, control: show?.hostedSlug ?? null };
      }, args.name);
      expect(slugs.output).toBeTruthy();
      await page.getByTestId('verb-take').click();
      // The server holds the take before the browser source opens (output-cold-boot.spec.ts).
      await expect
        .poll(() => page.evaluate(async (slug) => {
          const { controlShowBySlug } = await import('/src/control/hostedControl.ts');
          const answer = await controlShowBySlug(slug!);
          return Object.keys((answer.ok ? answer.value : null)?.liveCue ?? {}).length;
        }, slugs.control), { timeout: 30_000 })
        .toBeGreaterThan(0);
      const output = await context.newPage();
      await output.goto(`/output?production=${encodeURIComponent(slugs.output!)}`);
      // On air, not merely in the markup: the speaker's name is in a frame, and that line and
      // everything above it is opaque and has a size.
      const onAir = () =>
        Promise.all(
          output.frames().map((f) =>
            f
              .evaluate(() => {
                const line = document.getElementById('f0');
                if (!line || line.textContent?.trim() !== 'Anna Andersson') return 0;
                let opacity = 1;
                for (let el: Element | null = line; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
                const box = line.getBoundingClientRect();
                return box.width > 0 && box.height > 0 ? opacity : 0;
              })
              .catch(() => 0),
          ),
        ).then((all) => Math.max(0, ...all));
      await expect.poll(onAir, { timeout: 45_000 }).toBeGreaterThan(0.9);
      await output.waitForTimeout(1500);
      await output.screenshot({ path: 'test-results/signed-in/connector-send-output.png' });
      await output.close();
      await page.getByTestId('verb-out').click();
      await unpublishForCleanup(page);
      console.log('connector send: the installed production published, and its first cue played in the browser source');

      // IMPORT: a pack file with a recipe entry installs the same way.
      const packFile = {
        format: 'noacg-pack',
        version: 1,
        name: `Recipe import ${stamp}`,
        graphics: [{ name: 'Imported speaker', recipe: { type: 'lower-third', design: lowerThird.designs[0].id, values: { name: 'Cleo Carlsson', title: 'Host' } }, layer: 20 }],
        cues: [{ graphic: 'Imported speaker', label: 'Cleo', values: { f0: 'Cleo Carlsson', f1: 'Host' } }],
      };
      await page.goto('/app#/home/productions');
      await page.getByTestId('import-pack-file').setInputFiles({ name: 'recipe.noacgpack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packFile)) });
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('production-page')).toContainText(packFile.name);
      const imported = await page.evaluate(async (name) => {
        const { loadShows } = await import('/src/model/shows.ts');
        const { publishGate } = await import('/src/validation/publishGate.ts');
        const show = loadShows().find((s) => s.name === name)!;
        const g = show.graphics[0];
        return { name: g.name, value: g.template.fields[0]?.value, gate: publishGate(g.template, true).ok, cue: show.cues?.[0]?.values };
      }, packFile.name);
      expect(imported).toEqual({ name: 'Imported speaker', value: 'Cleo Carlsson', gate: true, cue: expect.objectContaining({ f0: 'Cleo Carlsson', f1: 'Host' }) });
      console.log('connector send: a pack file with a recipe entry installed through Import and passed the gate');
    } finally {
      await deleteOAuthClient(SUPABASE_URL, SERVICE_ROLE_KEY, provider.info?.client_id);
      for (const id of userIds) {
        await admin.storage.from('user-assets').remove([`${id}/connector-send-logo`]).catch(() => undefined);
        await admin.auth.admin.deleteUser(id).catch(() => undefined);
      }
    }
  });
});
