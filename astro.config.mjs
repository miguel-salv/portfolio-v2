import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://miguelsalv.com",
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1" },
  // Preserve the existing inline text spacing across the Astro 7 migration.
  compressHTML: true,
  build: {
    format: "preserve"
  }
});
