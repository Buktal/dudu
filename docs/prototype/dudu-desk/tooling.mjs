// This throwaway prototype reuses the installed DuduDesk toolchain. No install.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const desk = path.resolve(root, "../../../dudu-desk");
const requireDesk = createRequire(path.join(desk, "package.json"));
const dependency = (name) =>
  import(pathToFileURL(requireDesk.resolve(name)).href);
const { createServer, build } = await dependency("vite");
const { default: react } = await dependency("@vitejs/plugin-react");
const { default: tailwindcss } = await dependency("@tailwindcss/vite");
const packages = [
  "react",
  "react-dom",
  "motion",
  "lucide-react",
  "@faker-js/faker",
  "@base-ui/react",
  "cn",
  "class-variance-authority",
  "dayjs",
  "tailwindcss",
  "tw-animate-css",
  "shadcn",
  "@fontsource-variable/inter",
];
const config = {
  root,
  configFile: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@faker-js/faker/locale/zh_CN",
        replacement: requireDesk.resolve("@faker-js/faker/locale/zh_CN"),
      },
      { find: "@desk", replacement: path.join(desk, "src") },
      { find: "@", replacement: path.join(root, "src") },
      ...packages.map((name) => ({
        find: name,
        replacement: path.join(desk, "node_modules", name),
      })),
    ],
    dedupe: ["react", "react-dom"],
  },
};

if (process.argv[2] === "build") {
  const result = await build({
    ...config,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      cssCodeSplit: false,
      assetsInlineLimit: 1000000,
      lib: {
        entry: path.join(root, "src/main.tsx"),
        name: "DuduDeskPrototype",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result)
    ? result.flatMap((item) => item.output)
    : result.output;
  const js = output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  const css = output
    .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
    .map((item) => item.source)
    .join("\n");
  const favicon = await readFile(
    path.join(root, "src/assets/dudu-favicon.svg"),
    "utf8",
  );
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f7f5"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}"><title>嘟嘟 · 接待原型探索</title><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
  const destination = path.join(root, "dudu-desk-prototype.html");
  await writeFile(destination, html);
  process.stdout.write(`Standalone prototype: ${destination}\n`);
} else {
  const server = await createServer({
    ...config,
    server: {
      host: "127.0.0.1",
      port: 4317,
      strictPort: true,
      fs: { allow: [root, desk] },
    },
  });
  await server.listen();
  server.printUrls();
}
