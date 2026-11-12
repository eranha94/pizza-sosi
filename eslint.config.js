import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// The Backend/Frontend wall, enforced at build time.
const backendImports = {
  patterns: [
    { group: ['**/backend/**', '@pizza-sosi/functions', '@pizza-sosi/functions/*'], message: 'Frontend must never import backend code. Talk to the API instead.' },
    { group: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*'], message: 'Server SDKs are backend-only.' },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/lib/**', '**/node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': ['error', backendImports],
      'no-restricted-globals': ['error', { name: 'process', message: 'No server environment in the browser. Use import.meta.env.VITE_PUBLIC_*.' }],
    },
  },
  {
    files: ['contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['firebase', 'firebase/*', 'firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*'], message: 'contracts holds shapes only: no Firebase or database access.' },
          { group: ['**/frontend/**', '**/backend/**'], message: 'contracts must not depend on either side.' },
        ],
      }],
    },
  },
  {
    files: ['backend/**/*.ts', 'backend/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/frontend/**', 'firebase', 'firebase/*'], message: 'Backend uses the Admin SDK, never frontend code.' }] }],
    },
  },
  {
    // Rules tests act as a browser client on purpose (client SDK against the emulator).
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
