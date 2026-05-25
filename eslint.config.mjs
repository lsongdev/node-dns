import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files          : [ '**/*.js' ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType : 'commonjs',
      globals    : {
        ...globals.node,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      'no-unused-vars': [ 'error', {
        args              : 'none',
        caughtErrors      : 'none',
        ignoreRestSiblings: true,
      } ],
      '@stylistic/semi'                       : [ 'error', 'always' ],
      '@stylistic/space-before-function-paren': [ 'error', {
        anonymous : 'never',
        named     : 'never',
        asyncArrow: 'never',
        catch     : 'always',
      } ],
      '@stylistic/no-multi-spaces'      : 'error',
      '@stylistic/array-bracket-spacing': [ 'error', 'always' ],
      '@stylistic/key-spacing'          : [ 'error', {
        align: {
          beforeColon: true,
          afterColon : true,
          on         : 'colon',
        },
      } ],
      '@stylistic/comma-dangle': [ 'error', 'always-multiline' ],
    },
  },
];
