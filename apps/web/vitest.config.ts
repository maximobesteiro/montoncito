import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
  test: {
    // Browser-heavy files compete for CPU on smaller development machines.
    maxWorkers: 1,
    fileParallelism: false,
  },
});
