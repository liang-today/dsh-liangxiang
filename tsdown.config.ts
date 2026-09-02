/**
 * Build config: host half (ESM, node) + client half (browser CJS factory).
 *
 * The client artifact format REPLICATES the in-tree `clientBundle` preset
 * (deepseek-harness packages/client/tsdown.client.ts @ db6bdc3576): the
 * `window.__ModuleLoader__.load({ id, factory })` banner/footer wrapping, the
 * platform-module externals resolved through the loader's frozen module
 * table, and the NODE_ENV/import.meta.env substitutions. That preset is not
 * published, so this file is the single place that mirrors it — docs/003 row
 * C6 (semi-public, the largest single point of breakage). Re-verify against
 * tsdown.client.ts on every DSH upgrade.
 */
import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-liangxiang'

/**
 * Exact mirror of PLATFORM_MODULES (packages/client/web/src/platform.ts @
 * db6bdc3576). Anything NOT in this list must inline: a require() the loader's
 * frozen module table cannot answer throws at boot.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig([
  {
    name: PACKAGE_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    // This is the single owner of the shared output directory cleanup. The
    // backend and client configs below write into the same directory without
    // cleaning it a second time.
    clean: true,
  },
  {
    // Standalone localhost backend process (node:http + node:sqlite). NOT part
    // of the installable DSH bundle: the plugin talks to it over HTTP.
    name: `${PACKAGE_ID}/backend`,
    entry: { backend: 'src/backend/main.ts', 'backend-cli': 'src/backend/cli.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
