import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import { demoHeaders } from "./scripts/demo-headers.mjs";

const host = process.env.TAURI_DEV_HOST;

/** The website demo (`npm run build:demo` -> dist-demo/, copied to the home page by `npm run demo:strona`):
 *  it opens in a frame on the author's home page only and stays out of search engines. */
function demoSite(): Plugin {
  return {
    name: "demo-site",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: demoHeaders() });
    },
    transformIndexHtml: () => [{ tag: "meta", attrs: { name: "robots", content: "noindex" }, injectTo: "head" }],
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === "demo" && demoSite()],
  // The demo lives in a folder of the home page (szymonbakonis.pl/kalkulator-uop-b2b/), so its files are linked relatively.
  base: mode === "demo" ? "./" : "/",
  // Tauri: keep Rust errors visible and use a fixed port.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
