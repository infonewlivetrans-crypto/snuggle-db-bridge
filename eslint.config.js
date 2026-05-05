import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const NO_SERVER_IMPORTS = {
  patterns: [
    {
      group: [
        "@/server/*",
        "@/lib/server-functions/*",
        "**/server/*.server",
        "**/server/*.functions",
      ],
      message:
        "Серверный код запрещён в клиентских файлах (src/routes/**, src/components/**). Используйте fetch('/api/...') вместо импорта из src/server/* или src/lib/server-functions/*.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "src/routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", NO_SERVER_IMPORTS],
    },
  },
  {
    // Все клиентские routes, кроме серверных endpoint'ов в src/routes/api/**
    files: ["src/routes/**/*.{ts,tsx}"],
    ignores: ["src/routes/api/**"],
    rules: {
      "no-restricted-imports": ["error", NO_SERVER_IMPORTS],
    },
  },
  {
    files: ["src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", NO_SERVER_IMPORTS],
    },
  },
  eslintPluginPrettier,
);
