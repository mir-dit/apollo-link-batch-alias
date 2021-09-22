import resolve from '@rollup/plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript  from 'rollup-plugin-typescript2';

export const globals = {
  // Apollo
  'zen-observable-ts': 'apolloLink.zenObservable',

  // GraphQL
  'graphql/language/visitor': 'graphql.visitor',
  'graphql/language/printer': 'graphql.printer',

  // TypeScript
  'tslib': 'tslib',

  // Other
  'zen-observable': 'Observable',
};

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    exports: 'named',
    globals,
  },
  external: Object.keys(globals),
  plugins: [
    resolve({ module: true }),
    commonjs(),
		typescript({
      tsconfigOverride: {
        compilerOptions: {
          module: "es2015",
        },
      },
    }),
	],
};