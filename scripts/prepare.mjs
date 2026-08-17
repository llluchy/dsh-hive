/**
 * Self-contained build for `dsh plugin add github:…` installs.
 *
 * pnpm runs this after a git install (the `prepare` lifecycle script). It must
 * NOT assume a sibling monorepo checkout, so it uses esbuild directly to
 * transpile `src/` into `lib/` with every harness dependency externalized —
 * those resolve at runtime from the installed harness, not from here.
 *
 * No type checking, no project references (per the official "Package and
 * install a plugin" tutorial).
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'

const external = [/^@deepseek-ai\//]

// The single entrypoint hosts the plugin's `export const name` + `apply`, plus
// the two model-facing tools. `@deepseek-ai/cordis` and `@deepseek-ai/dsh-tools`
// types are type-only here, so esbuild emits nothing for them.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external,
  sourcemap: false,
  minify: false,
})

// Hand-written `.d.ts` so `types` resolves without a tsc pass.
mkdirSync('lib', { recursive: true })
writeFileSync('lib/index.d.ts', [
  "import type { Context } from '@deepseek-ai/cordis'",
  '',
  "export const name = 'dsh-hive'",
  "export const inject: string[]",
  'export function apply(ctx: Context): void',
  '',
].join('\n'))

console.log('[dsh-hive] prepare: built lib/index.js')
