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
	assert.equal(PANEL_VERBS.length, 14)
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
