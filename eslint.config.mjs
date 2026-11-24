import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Synthetic test loaders deliberately provide a CommonJS module object.
  {files:["tests/**/*.mjs"],rules:{"@next/next/no-assign-module-variable":"off"}},
  {files:["oliverfee-360/tests/**/*.cjs"],rules:{"@typescript-eslint/no-require-imports":"off"}},
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      ".compensation-review/**",
      ".master-review/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
