import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  seeded,
  similar,
  makeDesign,
  plan,
  variations,
  applyPatch,
  validateProject,
} from "../web/model.js";
import { catalog, metadata } from "../lib/catalog.mjs";
import { previewBytes } from "../lib/font-bytes.mjs";
import { serve } from "../lib/server.mjs";
test("deterministic shuffle preserves inventory; similarity favors shared metadata", () => {
  const fonts = [
    { id: "a", category: "sans", tags: ["mono"] },
    { id: "b", category: "serif", tags: [] },
    { id: "c", category: "sans", tags: ["mono"] },
  ];
  assert.deepEqual(seeded(fonts, 21), seeded([...fonts].reverse(), 21));
  assert.equal(fonts[0].id, "a");
  assert.equal(similar(fonts[0], fonts)[0].id, "c");
});
test("live layout and refinement preserve text, spacing, mixed fonts and positioned ancestors", () => {
  const parent = makeDesign("Font Reviver", "a", {
    layout: "stacked",
    overrides: { 1: { fontId: "b", x: 20, rotation: 15 } },
  });
  const words = plan(parent, (t) => t.length * 50);
  assert.deepEqual(
    words.map((w) => w.text),
    ["Font", "Reviver"],
  );
  assert.equal(words[1].fontId, "b");
  assert.equal(words[1].rotation, 15);
  assert.equal(words[1].x, 150);
  const side = plan(
    makeDesign("Font Reviver", "a", { overrides: { 1: { fontId: "b" } } }),
    (t) => t.length * 50,
  );
  assert.equal(side.length, 2);
  assert.equal(side[0].y, side[1].y);
  assert.equal(side[1].fontId, "b");
  assert.ok(side[1].x > side[0].x);
  parent.elements = words;
  const children = variations(parent);
  assert.equal(children.length, 10);
  assert.notEqual(
    children[0].elements[0].tracking,
    children[9].elements[0].tracking,
  );
  assert.equal(parent.elements[0].tracking, 0);
  assert.equal(children[0].parentId, parent.id);
  assert.equal(children[0].elements[1].fontId, "b");
  const patch = applyPatch(parent, { leading: 2, outline: true });
  assert.equal(patch.elements[1].outline, true);
  assert.ok(patch.elements[1].y > words[1].y);
  assert.throws(() => applyPatch(parent, { leading: 0 }));
  assert.throws(() => applyPatch(parent, { command: "shell" }));
  assert.throws(() =>
    validateProject({ schemaVersion: 2, text: "A", rounds: [] }),
  );
});
test(
  "catalog, collection-face previews and positioned export work through HTTP",
  { skip: process.platform !== "darwin", timeout: 90000 },
  async () => {
    const server = await serve(25000 + Math.floor(Math.random() * 1000));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (url, data) => {
      const res = await fetch(base + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return { res, data: await res.json() };
    };
    try {
      const {
        data: { fonts },
      } = await post("/api/catalog", {
        text: "Font\nReviver",
        sources: [
          {
            type: "files",
            paths: ["/System/Library/Fonts/Supplemental/Arial.ttf"],
          },
        ],
      });
      assert.equal(fonts[0].category, "sans");
      assert.equal((await fetch(base + fonts[0].previewUrl)).status, 200);
      const { res, data } = await post("/api/compose", {
        words: [
          {
            text: "Font\nReviver",
            fontId: fonts[0].id,
            x: 100,
            y: 300,
            rotation: 15,
            tracking: 2,
            size: 100,
            outline: true,
            stroke: 2,
          },
        ],
      });
      assert.equal(res.status, 200, JSON.stringify(data));
      const svg = await (await fetch(base + data.svg)).text();
      assert.match(svg, /<path/);
      assert.doesNotMatch(svg, /<text|NaN|Infinity/);
      assert.match(svg, /fill="none"/);
      assert.match(svg, /licensing/);
      assert.equal(
        (await fs.readFile(data.files.png)).subarray(1, 4).toString(),
        "PNG",
      );
      const bad = await post("/api/compose", {
        words: [
          {
            text: "A",
            fontId: fonts[0].id,
            x: 0,
            y: 0,
            rotation: 0,
            tracking: 0,
            size: -1,
            outline: false,
            stroke: 1,
          },
        ],
      });
      assert.equal(bad.res.status, 400);
      const collection = "/System/Library/Fonts/Helvetica.ttc";
      const raw = await fs.readFile(collection);
      const faces = await catalog({
        text: "Mark",
        sources: [{ type: "files", paths: [collection] }],
      });
      const standalone = previewBytes(raw, faces[0].face);
      assert.notEqual(standalone.toString("ascii", 0, 4), "ttcf");
      assert.equal(metadata(standalone, "Helvetica").category, "sans");
    } finally {
      await new Promise((r) => server.close(r));
    }
  },
);

test("manual returns preserve word groups and blank rows; one-line mode keeps source text", () => {
  const text = "mark this\n\nword";
  const d = makeDesign(text, "a", { layout: "lines" }),
    measure = (t) => t.length * 40;
  const words = plan(d, measure);
  assert.deepEqual(
    words.map((w) => w.text),
    ["mark", "this", "word"],
  );
  assert.equal(words[0].y, words[1].y);
  assert.ok(words[1].x > words[0].x);
  assert.equal(words[2].y - words[0].y, 230);
  const flat = plan({ ...d, layout: "horizontal" }, measure);
  assert.equal(new Set(flat.map((w) => w.y)).size, 1);
  assert.equal(d.text, text);
  assert.deepEqual(plan(d, measure), words);
  assert.equal(applyPatch(d, { layout: "lines" }).layout, "lines");
});
