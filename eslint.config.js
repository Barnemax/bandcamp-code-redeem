import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            'indent': ['error', 2],
            'quotes': ['error', 'single'],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-unused-vars': ['error', {
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
        },
    },
    {
        ignores: ['dist/', 'node_modules/', 'eslint.config.js'],
    },
);
