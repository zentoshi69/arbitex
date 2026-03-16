import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce explicit return types on exported functions
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      // No floating promises — critical for async job safety
      "@typescript-eslint/no-floating-promises": "error",
      // No non-null assertions — use proper guards
      "@typescript-eslint/no-non-null-assertion": "error",
      // No any — use unknown where necessary
      "@typescript-eslint/no-explicit-any": "warn",
      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // No unused vars (allow _ prefix)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer nullish coalescing
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      // Prefer optional chaining
      "@typescript-eslint/prefer-optional-chain": "error",
    },
  },
  {
    // Relax rules for test files
    files: ["**/*.test.ts", "**/*.spec.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/generated/**",
      "packages/db/src/generated/**",
    ],
  }
);
