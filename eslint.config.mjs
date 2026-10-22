import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
]);
