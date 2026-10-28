import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ACTION_VERBS } from '../actions.js'
import { PANEL_VERBS, VERB_NAMES } from '../protocol.js'

// The guide an operator installs from, read as shipped (build-test/__tests__ -> companion/HELP.md).
const help = readFileSync(fileURLToPath(new URL('../../companion/HELP.md', import.meta.url)), 'utf8')

test('the action list is every panel verb, once', () => {
	const actions = [...Object.values(ACTION_VERBS), 'select-cue', 'take-cue', 'trigger-cue']
	assert.deepEqual([...actions].sort(), [...PANEL_VERBS].sort())
})

test('the guide names every action as Companion lists it', () => {
	for (const verb of PANEL_VERBS)
		assert.ok(help.includes(`**${VERB_NAMES[verb]}**`), `HELP.md names ${VERB_NAMES[verb]}`)
})

test('the guide describes the lease, not the switch it replaced', () => {
	assert.ok(!/Answer the panel on this page/i.test(help), 'no answer switch')
	assert.ok(help.includes('**Use here**'))
	assert.ok(/refused, never queued/.test(help))
})

test('the guide covers graphic keys: the action, the presets, the outcomes and the one-press rule', () => {
	assert.ok(help.includes('**Graphic action**'))
	assert.ok(help.includes('**Pinned graphics**'))
	assert.ok(help.includes('`graphic_actions`'))
	assert.ok(/never sent again/.test(help))
	assert.ok(/keep working/.test(help), 'unpinning stops nothing')
	assert.ok(!/—/.test(help), 'no em dashes')
})

// The page's Setup menu, read from the app's source beside this module (build-test/__tests__ -> repo root).
// This assumes the NoaCG Studio repository layout; the module's tests run in no workflow yet (#1758).
const setupMenu = readFileSync(
	fileURLToPath(new URL('../../../src/components/home/ProductionSetupMenu.tsx', import.meta.url)),
	'utf8',
)

test('the guide names the Setup menu item as the production page draws it', () => {
	const named = [...help.matchAll(/\*\*Setup\*\*, then \*\*([^*]+)\*\*/g)].map((m) => m[1])
	assert.ok(named.length > 0, 'the guide says which Setup item opens the panel list')
	// A menu item's label is a JSX text line of its own; "Panel" alone also appears in code.
	const labels = new Set(setupMenu.split('\n').map((line) => line.trim()))
	for (const item of named) assert.ok(labels.has(item), `the Setup menu has an item "${item}"`)
})
