import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'vue'
];

const plugins = [
  nodeResolve({
    preferBuiltins: true,
    browser: true
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false
  })
];

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: pkg.module,
      format: 'es',
      sourcemap: true
    },
    external,
    plugins
  },
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true
    },
    external,
    plugins
  },
  // UMD build (for browser)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'ErrorExplorerVue',
      globals: {
        vue: 'Vue',
        axios: 'axios'
      },
      sourcemap: true
    },
    external: ['vue'],
    plugins: [
      ...plugins,
      terser()
    ]
  },
  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: pkg.types,
      format: 'es'
    },
    plugins: [dts()]
  }
];