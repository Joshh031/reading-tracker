import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { workflow } from "workflow/vite";

export default defineConfig({
  plugins: [react(), nitro(), workflow()],
  nitro: {
    serverDir: "./backend",
    routes: { "/api/**": { handler: "./server/http.js", format: "node" } },
    routeRules: {
      "/**": {
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "X-Frame-Options": "DENY",
        },
      },
      "/api/**": { headers: { "Cache-Control": "private, no-store" } },
      "/sw.js": { headers: { "Cache-Control": "no-cache" } },
    },
    vercel: { entryFormat: "node", functions: { maxDuration: 240 } },
  },
});
