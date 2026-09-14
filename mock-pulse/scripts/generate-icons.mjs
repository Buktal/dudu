import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@tauri-apps/cli";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = await mkdtemp(join(tmpdir(), "mockpulse-icons-"));
const iconsDir = join(projectRoot, "src-tauri", "icons");

try {
  await run([
    "icon",
    join(projectRoot, "public", "logo.svg"),
    "--output",
    outputDir,
  ]);
  await mkdir(iconsDir, { recursive: true });
  const desktopIcons = (await readdir(outputDir)).filter((name) =>
    /\.(png|ico|icns)$/.test(name),
  );
  await Promise.all(
    desktopIcons.map((name) =>
      copyFile(join(outputDir, name), join(iconsDir, name)),
    ),
  );
  await copyFile(
    join(outputDir, "icon.ico"),
    join(projectRoot, "public", "favicon.ico"),
  );
} finally {
  if (
    dirname(resolve(outputDir)) === resolve(tmpdir()) &&
    basename(outputDir).startsWith("mockpulse-icons-")
  ) {
    await rm(outputDir, { recursive: true, force: true });
  }
}
