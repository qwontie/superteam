import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const ENV_PREFIX = "VITE_";
const webDir = dirname(fileURLToPath(import.meta.url));
const worktreeRoot = resolve(webDir, "../..");

function mainCheckoutRoot() {
  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return commonDir ? dirname(commonDir) : null;
  } catch {
    return null;
  }
}

function inheritEnv(mode: string) {
  const candidates = [webDir, worktreeRoot, mainCheckoutRoot()];
  const dirs = new Set(candidates.filter((dir) => dir !== null));
  for (const dir of dirs) {
    for (const [key, value] of Object.entries(loadEnv(mode, dir, ENV_PREFIX))) {
      process.env[key] ??= value;
    }
  }
}

export default defineConfig(({ mode }) => {
  inheritEnv(mode);

  return {
    plugins: [
      tanstackRouter({ autoCodeSplitting: true, target: "react" }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": resolve(webDir, "src") },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { changeOrigin: true, target: "http://localhost:8000" },
      },
      strictPort: false,
    },
  };
});
