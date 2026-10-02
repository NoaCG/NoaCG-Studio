import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const base = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	{ ignores: ['build-test/**'] },
	...base,
	{
		// node:test's test() returns a promise the runner itself awaits.
		files: ['src/__tests__/**/*.ts'],
		rules: { '@typescript-eslint/no-floating-promises': 'off' },
	},
]
