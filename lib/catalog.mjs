import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { previewBytes } from "./font-bytes.mjs";
import { listFonts, dataRoot } from "./core.mjs";
export const registry = new Map();
export function metadata(bytes, label = "") {
  let category = "other",
    weight = 400,
    width = 5;
  try {
    const tables = new Map();
    const num = bytes.readUInt16BE(4);
    for (let i = 0; i < num; i++) {
      const off = 12 + i * 16;
      tables.set(
        bytes.toString("ascii", off, off + 4),
        bytes.readUInt32BE(off + 8),
      );
    }
    const os = tables.get("OS/2");
    if (os !== undefined && os + 42 < bytes.length) {
      weight = bytes.readUInt16BE(os + 4);
      width = bytes.readUInt16BE(os + 6);
      const family = bytes.readUInt16BE(os + 30) >> 8;
      const serif = bytes[os + 33];
      if ([1, 2, 3, 4, 5, 7].includes(family)) category = "serif";
      if (family === 8 || (bytes[os + 32] === 2 && serif >= 11 && serif <= 15))
        category = "sans";
      if (family === 10 || bytes[os + 32] === 3) category = "script";
    }
  } catch {
    /* Legacy containers stay unclassified unless source hints exist. */
  }
  const tags = [];
  if (category === "other") {
    if (
      /serif|egypt|slab|caslon|baskerville|cooper|plantin|rockwell|bodoni|clarendon/i.test(
        label,
      )
    )
      category = "serif";
    else if (
      /sans|grotes|gothic|helvet|avenir|futura|univers|eurostile/i.test(label)
    )
      category = "sans";
    else if (/script|cursive|brush|handwritten|calligraph/i.test(label))
      category = "script";
  }
  for (const [tag, re] of Object.entries({
    rounded: /round|cocon|soft|bubble/i,
    condensed: /condens|compacta|compressed/i,
    mono: /mono|courier|ocr|typewriter/i,
    geometric: /futura|bauhaus|avant|geometr|eurostile/i,
    stencil: /stencil/i,
    slab: /slab|egypt|rockwell|clarendon|beton/i,
    architectural: /architect|tekton|blueprint|wright/i,
  }))
    if (re.test(label)) tags.push(tag);
  return {
    category,
    weight,
    width,
    tags,
    classification:
      category === "other" ? "unknown" : "metadata or source hint",
  };
}
// Read small SFNT headers/OS/2 tables rather than retain every source font.
async function inspectFile(filename, face, label, containers) {
  const file = await fs.open(filename);
  try {
    const head = Buffer.alloc(12);
    await file.read(head, 0, 12, 0);
    if (head.toString("ascii", 0, 4) === "ttcf") {
      if (!containers.has(filename)) {
        if (containers.size >= 2)
          containers.delete(containers.keys().next().value);
        containers.set(filename, await file.readFile());
      }
      return metadata(previewBytes(containers.get(filename), face), label);
    }
    const count = head.readUInt16BE(4);
    if (count > 4096) return metadata(Buffer.alloc(0), label);
    const tables = Buffer.alloc(count * 16);
    await file.read(tables, 0, tables.length, 12);
    for (let i = 0; i < count; i++)
      if (tables.toString("ascii", i * 16, i * 16 + 4) === "OS/2") {
        const os = Buffer.alloc(48);
        await file.read(os, 0, 48, tables.readUInt32BE(i * 16 + 8));
        const minimal = Buffer.alloc(80);
        minimal.writeUInt16BE(1, 4);
        minimal.write("OS/2", 12);
        minimal.writeUInt32BE(32, 20);
        os.copy(minimal, 32);
        return metadata(minimal, label);
      }
    return metadata(Buffer.alloc(0), label);
  } finally {
    await file.close();
  }
}
export async function catalog(input = {}) {
  if (!Array.isArray(input.sources ?? []) || (input.sources?.length ?? 0) > 30)
    throw Error("Choose up to 30 sources.");
  if (
    input.text !== undefined &&
    (typeof input.text !== "string" || input.text.length > 200)
  )
    throw Error("Enter up to 200 characters.");
  const records = [],
    containers = new Map(),
    seen = new Set();
  for (const source of input.sources || [{ type: "system" }]) {
    if (!source || !["system", "folder", "files"].includes(source.type))
      throw Error("Unknown font source.");
    if (
      source.type === "folder" &&
      (typeof source.path !== "string" || !source.path.trim())
    )
      throw Error("Choose a font folder path.");
    if (
      source.type === "files" &&
      (!Array.isArray(source.paths) ||
        !source.paths.length ||
        source.paths.some((p) => typeof p !== "string"))
    )
      throw Error("Choose font file paths.");
    const found = await listFonts({
      names: input.text
        ? [input.text.replace(/[\r\n\t]/g, " ")]
        : ["logotyper"],
      ...(source.type === "folder" ? { fontDirectory: source.path } : {}),
      ...(source.type === "files" ? { fontFiles: source.paths } : {}),
    });
    for (const f of found) {
      const id = createHash("sha256")
        .update(`${f.source || "system"}:${f.id}`)
        .digest("hex")
        .slice(0, 24);
      if (seen.has(id)) continue;
      seen.add(id);
      let info;
      try {
        info = f.source
          ? await inspectFile(
              f.source,
              f.name,
              `${f.family} ${f.source}`,
              containers,
            )
          : metadata(Buffer.alloc(0), f.family);
      } catch {
        info = metadata(Buffer.alloc(0), f.family);
      }
      const r = {
        id,
        family: f.family,
        face: f.name,
        source: source.type,
        sourceLabel:
          source.type === "folder" ? path.basename(source.path) : source.type,
        ...info,
        previewUrl: f.source ? `/api/font/${id}` : null,
        localName: f.name,
        canExport: true,
      };
      registry.set(id, { ...r, path: f.source });
      records.push(r);
    }
  }
  return records;
}
export const googleStarter = [
  ["Inter", "sans"],
  ["DM Sans", "sans"],
  ["Space Grotesk", "sans"],
  ["Manrope", "sans"],
  ["Outfit", "sans"],
  ["Work Sans", "sans"],
  ["Archivo", "sans"],
  ["Bricolage Grotesque", "sans"],
  ["Lora", "serif"],
  ["Fraunces", "serif"],
  ["Libre Baskerville", "serif"],
  ["Cormorant Garamond", "serif"],
  ["DM Serif Display", "serif"],
  ["Roboto Slab", "serif"],
  ["Space Mono", "other"],
  ["IBM Plex Mono", "other"],
  ["Caveat", "script"],
  ["Kalam", "script"],
  ["Bodoni Moda", "serif"],
  ["Unbounded", "sans"],
].map(([family, category]) => ({
  id: `google:${family}`,
  family,
  face: family,
  source: "google",
  sourceLabel: "Google starter catalog",
  category,
  weight: 400,
  width: 5,
  tags: /Mono/.test(family) ? ["mono"] : [],
  canExport: true,
}));
export async function googleFont(family) {
  if (!googleStarter.some((f) => f.family === family))
    throw new Error("Unknown Google starter font.");
  const css = await fetch(
    `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:400`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!css.ok) throw new Error("Google Fonts could not be reached.");
  const text = await css.text();
  const urls = [
    ...text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g),
  ].map((m) => m[1]);
  if (!urls.length) throw new Error("No font file available.");
  const res = await fetch(urls.at(-1), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Font download failed.");
  const bytes = Buffer.from(await res.arrayBuffer());
  const signature = bytes.toString("ascii", 0, 4);
  const ext =
    signature === "wOF2"
      ? "woff2"
      : signature === "wOFF"
        ? "woff"
        : signature === "OTTO"
          ? "otf"
          : "ttf";
  const dir = path.join(dataRoot, "google");
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(
    dir,
    createHash("sha256").update(family).digest("hex") + "." + ext,
  );
  await fs.writeFile(dest, bytes);
  const id = `google:${family}`;
  registry.set(id, {
    ...googleStarter.find((f) => f.id === id),
    path: dest,
    canExport: ["ttf", "otf"].includes(ext),
  });
  return { bytes, ext, canExport: ["ttf", "otf"].includes(ext) };
}
