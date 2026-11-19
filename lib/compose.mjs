import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { registry } from "./catalog.mjs";
import { root, dataRoot } from "./core.mjs";
const exec = promisify(execFile);
let compilation;
export async function compose(design) {
  if (
    !Array.isArray(design.words) ||
    !design.words.length ||
    design.words.length > 160
  )
    throw new Error("A design needs 1–160 text elements.");
  const width = 1000,
    height = 650;
  const words = design.words.map((w) => {
    const font = registry.get(w.fontId);
    if (!font)
      throw new Error(
        "Font unavailable. Reload its source before exporting this project.",
      );
    if (font.canExport === false)
      throw new Error(
        "This provider font supports live preview only in its current format. Use an exportable local font.",
      );
    if (typeof w.outline !== "boolean")
      throw Error("Choose filled or outlined text.");
    if (typeof w.text !== "string" || w.text.length > 200 || !w.text.trim())
      throw new Error("Invalid text element.");
    for (const k of ["x", "y", "rotation", "tracking", "stroke", "size"])
      if (!Number.isFinite(w[k]) || Math.abs(w[k]) > 10000)
        throw new Error("Invalid transform.");
    if (w.size <= 0 || w.stroke < 0)
      throw new Error("Size must be positive and stroke nonnegative.");
    return { ...w, fontPath: font.path || null, postscript: font.face };
  });
  const binary = await buildCompose();
  const id = randomUUID();
  const dir = path.join(dataRoot, "outputs", id);
  await fs.mkdir(dir, { recursive: true });
  const request = path.join(dir, "request.json");
  await fs.writeFile(
    request,
    JSON.stringify({ width, height, words, output: path.join(dir, "mark") }),
  );
  await exec(binary, [request], { timeout: 60000, maxBuffer: 1024 * 1024 });
  await fs.rm(request);
  await fs.writeFile(
    path.join(dir, "design.json"),
    JSON.stringify(design.project ?? design, null, 2),
  );
  return {
    files: {
      svg: path.join(dir, "mark.svg"),
      png: path.join(dir, "mark.png"),
      project: path.join(dir, "design.json"),
    },
    svg: `/outputs/${id}/mark.svg`,
    png: `/outputs/${id}/mark.png`,
    project: `/outputs/${id}/design.json`,
  };
}

export async function buildCompose() {
  const cache = path.join(root, ".cache");
  await fs.mkdir(cache, { recursive: true });
  const binary = path.join(cache, "compose");
  const source = path.join(root, "engine/Compose.swift");
  const stat = await fs.stat(binary).catch(() => null);
  if (!stat || stat.mtimeMs < (await fs.stat(source)).mtimeMs) {
    compilation ||= exec(
      "swiftc",
      [
        "-O",
        "-module-cache-path",
        path.join(cache, "modules"),
        source,
        "-o",
        binary,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    ).finally(() => (compilation = null));
    await compilation;
  }
  return binary;
}
