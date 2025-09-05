/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8", // or "istanbul" if you prefer
      reporter: ["text", "html"], // text in console, html in coverage/
    },
  },
});
