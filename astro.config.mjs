import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://miguelsalv.com",
  devToolbar: { enabled: false },
  build: {
    format: "preserve"
  }
});
