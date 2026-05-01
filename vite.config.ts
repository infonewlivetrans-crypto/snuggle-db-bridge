// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      // Чанки для тяжёлых клиентских библиотек, чтобы не входили в initial bundle
      // и грузились только при первом использовании соответствующих экранов/действий.
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("/xlsx/")) return "vendor-xlsx";
            if (id.includes("/jspdf/") || id.includes("/jspdf-autotable/")) return "vendor-pdf";
            if (id.includes("/docx/") || id.includes("/file-saver/")) return "vendor-docx";
            if (id.includes("/recharts/") || id.includes("/d3-")) return "vendor-charts";
            if (id.includes("/embla-carousel")) return "vendor-carousel";
            if (id.includes("/react-day-picker/") || id.includes("/date-fns/")) return "vendor-dates";
            if (id.includes("/@radix-ui/")) return "vendor-radix";
            return undefined;
          },
        },
      },
    },
  },
});
