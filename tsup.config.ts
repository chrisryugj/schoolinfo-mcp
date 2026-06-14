import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: false,
  },
  {
    entry: ["src/cli.ts", "src/mcp.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/server.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
  },
]);
