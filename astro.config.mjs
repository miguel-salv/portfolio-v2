import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://miguelsalv.com",
  devToolbar: { enabled: false },
  server: { host: "0.0.0.0" },
  build: {
    format: "preserve"
  }
});
