import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import type { RollupLog, RollupOptions } from 'rollup'

// @actions/* ship tsc's `this && this.__awaiter` helpers and a core <-> oidc-utils
// import cycle, both harmless; every other warning fails the build
const isActionsToolkitNoise = (log: RollupLog): boolean =>
  (log.code === 'THIS_IS_UNDEFINED' || log.code === 'CIRCULAR_DEPENDENCY') &&
  [log.id, ...(log.ids ?? [])].some((id) =>
    id?.includes('/node_modules/@actions/')
  )

const config: RollupOptions = {
  input: 'src/index.ts',
  onwarn: (log, warn) => {
    if (!isActionsToolkitNoise(log)) warn(log)
  },
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    inlineDynamicImports: true,
    sourcemap: true
  },
  plugins: [
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json()
  ]
}

export default config
