export const layouts = ["lines", "horizontal", "stacked", "offset", "initial"];
export function seeded(items, seed = 9000) {
  const a = [...items].sort((x, y) => x.id.localeCompare(y.id));
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function similar(font, fonts) {
  return fonts
    .filter((f) => f.id !== font.id)
    .map((f) => ({
      font: f,
      score:
        (f.category === font.category && f.category !== "other" ? 4 : 0) +
        (f.tags || []).filter((t) => (font.tags || []).includes(t)).length * 3 -
        Math.abs((f.weight || 400) - (font.weight || 400)) / 300 -
        Math.abs((f.width || 5) - (font.width || 5)) / 2,
    }))
    .sort((a, b) => b.score - a.score || a.font.id.localeCompare(b.font.id))
    .map((x) => ({
      ...x.font,
      matchReason:
        [
          x.font.category === font.category ? "same category" : null,
          ...(x.font.tags || []).filter((t) => (font.tags || []).includes(t)),
        ]
          .filter(Boolean)
          .join(" · ") || "related proportions",
    }));
}
export function makeDesign(text, fontId, settings = {}) {
  return {
    id: globalThis.crypto.randomUUID(),
    text,
    fontId,
    layout: "horizontal",
    tracking: 0,
    leading: 1.15,
    rotation: 0,
    outline: false,
    stroke: 1.5,
    offset: 45,
    overrides: {},
    ...settings,
  };
}
export function plan(design, measure) {
  if (design.elements) return design.elements.map((w) => ({ ...w }));
  if (design.layout === "lines") {
    let index = 0;
    const rows = design.text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((row) =>
        (row.match(/\S+/g) || []).map((text) => {
          const o = design.overrides?.[index++] || {},
            fontId = o.fontId || design.fontId;
          return {
            text,
            fontId,
            o,
            width: measure(text, fontId, design.tracking),
            gap: measure(" ", fontId, 0) + 2 * design.tracking,
          };
        }),
      );
    const widths = rows.map((row) =>
      row.reduce(
        (sum, w, i) => sum + w.width + (i < row.length - 1 ? w.gap : 0),
        0,
      ),
    );
    const scale = Math.min(
      1,
      760 / Math.max(1, ...widths),
      420 / (Math.max(1, rows.length) * 100 * design.leading),
    );
    return rows.flatMap((row, r) => {
      let cursor = 130;
      return row.map((w) => {
        const word = {
          text: w.text,
          fontId: w.fontId,
          x: cursor + (w.o.x || 0),
          y:
            330 +
            (r - (rows.length - 1) / 2) * 100 * design.leading * scale +
            (w.o.y || 0),
          size: 100 * scale,
          rotation: design.rotation + (w.o.rotation || 0),
          tracking: design.tracking,
          outline: design.outline,
          stroke: design.stroke,
        };
        cursor += (w.width + w.gap) * scale;
        return word;
      });
    });
  }
  const tokens = design.text.trim().split(/\s+/),
    horizontal = design.layout === "horizontal";
  const widths = tokens.map((t, i) =>
    measure(t, design.overrides?.[i]?.fontId || design.fontId, design.tracking),
  );
  const gaps = tokens.map(
    (_, i) =>
      measure(" ", design.overrides?.[i]?.fontId || design.fontId, 0) +
      2 * design.tracking,
  );
  const total = widths.reduce(
    (a, w, i) => a + w + (i < tokens.length - 1 ? gaps[i] : 0),
    0,
  );
  const span = horizontal
    ? total
    : Math.max(...widths, 1) +
      (design.layout === "offset"
        ? Math.abs(design.offset) * (tokens.length - 1)
        : 0);
  const scale = Math.min(
    1,
    (design.layout === "initial" ? 500 : 760) / Math.max(1, span),
    horizontal ? 1 : 420 / (tokens.length * 100 * design.leading),
  );
  let cursor = Math.max(80, (1000 - total * scale) / 2);
  const words = tokens.map((text, i) => {
    const o = design.overrides?.[i] || {},
      fontId = o.fontId || design.fontId;
    const x = horizontal
      ? cursor
      : 130 +
        (design.layout === "offset"
          ? (i * design.offset +
              Math.max(0, -design.offset * (tokens.length - 1))) *
            scale
          : 0);
    cursor += (widths[i] + gaps[i]) * scale;
    return {
      text,
      fontId,
      x: x + (o.x || 0),
      y:
        (horizontal ? 330 : 180 + i * 100 * design.leading * scale) +
        (o.y || 0),
      size: 100 * scale,
      rotation: design.rotation + (o.rotation || 0),
      tracking: design.tracking,
      outline: design.outline,
      stroke: design.stroke,
    };
  });
  if (design.layout === "initial" && tokens.length > 1) {
    const initials = tokens
      .slice(0, 3)
      .map((w) => Array.from(w)[0])
      .join("");
    return [
      {
        text: initials,
        fontId: design.fontId,
        x: 90,
        y: 330,
        rotation: design.rotation,
        tracking: 0,
        size: Math.min(
          160,
          (230 / Math.max(1, measure(initials, design.fontId, 0))) * 100,
        ),
        outline: design.outline,
        stroke: design.stroke,
      },
      ...words.map((w, i) => ({
        ...w,
        x: 380,
        y: 240 + i * 100 * design.leading * scale,
      })),
    ];
  }
  return words;
}
export function variations(parent, count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 250)
    throw Error("Choose 1–250 variations");
  return Array.from({ length: count }, (_, i) => {
    const d = structuredClone(parent),
      delta = (i - (count - 1) / 2) * 0.6,
      ratio = 1 + ((i % 3) - 1) * 0.05;
    d.id = globalThis.crypto.randomUUID();
    d.parentId = parent.id;
    d.tracking = Math.round((parent.tracking + delta) * 100) / 100;
    d.leading = Math.round(parent.leading * ratio * 100) / 100;
    if (d.elements) {
      const top = Math.min(...d.elements.map((w) => w.y));
      d.elements = d.elements.map((w) => ({
        ...w,
        tracking: w.tracking + delta,
        y: top + (w.y - top) * ratio,
      }));
    }
    d.variation = `Spacing step ${i + 1}/${count}`;
    return d;
  });
}
export function applyPatch(design, patch) {
  const allowed = [
    "text",
    "fontId",
    "layout",
    "tracking",
    "leading",
    "rotation",
    "outline",
    "stroke",
    "offset",
  ];
  const next = { ...design };
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) throw Error("Unsupported suggestion field: " + k);
    next[k] = v;
  }
  if (
    typeof next.text !== "string" ||
    !next.text.trim() ||
    next.text.length > 200
  )
    throw Error("Invalid words");
  if (typeof next.fontId !== "string" || typeof next.outline !== "boolean")
    throw Error("Invalid font or outline");
  if (!layouts.includes(next.layout)) throw Error("Invalid layout");
  for (const k of ["tracking", "leading", "rotation", "stroke", "offset"])
    if (!Number.isFinite(next[k])) throw Error("Invalid " + k);
  if (
    next.leading < 0.2 ||
    next.leading > 5 ||
    Math.abs(next.tracking) > 100 ||
    next.stroke < 0 ||
    next.stroke > 100 ||
    Math.abs(next.rotation) > 360 ||
    Math.abs(next.offset) > 1000
  )
    throw Error("Suggestion outside supported range");
  if (next.elements) {
    if (patch.layout || patch.text || patch.fontId) delete next.elements;
    else {
      const old = design.leading,
        top = Math.min(...next.elements.map((w) => w.y));
      next.elements = next.elements.map((w) => ({
        ...w,
        tracking: patch.tracking ?? w.tracking,
        outline: patch.outline ?? w.outline,
        stroke: patch.stroke ?? w.stroke,
        rotation: patch.rotation ?? w.rotation,
        y: top + ((w.y - top) * next.leading) / old,
      }));
    }
  }
  return next;
}
export function validateDesign(d) {
  if (!d || typeof d.id !== "string") throw Error("Invalid design");
  applyPatch(d, {});
  if (d.elements) {
    if (
      !Array.isArray(d.elements) ||
      !d.elements.length ||
      d.elements.length > 160
    )
      throw Error("Use 1–160 positioned elements");
    for (const w of d.elements) {
      if (
        typeof w.text !== "string" ||
        !w.text.trim() ||
        w.text.length > 200 ||
        typeof w.fontId !== "string" ||
        typeof w.outline !== "boolean"
      )
        throw Error("Invalid positioned element");
      for (const k of ["x", "y", "rotation", "tracking", "stroke", "size"])
        if (!Number.isFinite(w[k]) || Math.abs(w[k]) > 10000)
          throw Error("Invalid element transform");
      if (w.size <= 0 || w.stroke < 0) throw Error("Invalid element size");
    }
  }
  if (d.overrides) {
    if (typeof d.overrides !== "object" || Array.isArray(d.overrides))
      throw Error("Invalid word overrides");
    for (const o of Object.values(d.overrides)) {
      if (!o || typeof o !== "object") throw Error("Invalid word override");
      for (const k of ["x", "y", "rotation"])
        if (
          o[k] !== undefined &&
          (!Number.isFinite(o[k]) || Math.abs(o[k]) > 10000)
        )
          throw Error("Invalid word offset");
      if (o.fontId !== undefined && typeof o.fontId !== "string")
        throw Error("Invalid override font");
    }
  }
  return d;
}
export function validateProject(p) {
  if (
    !p ||
    p.schemaVersion !== 2 ||
    typeof p.text !== "string" ||
    p.text.length > 200 ||
    !Array.isArray(p.rounds) ||
    !p.rounds.length ||
    p.rounds.length > 100
  )
    throw Error("Not a supported mark this word project");
  const settings = p.settings;
  applyPatch(makeDesign("Project", "font"), settings || {});
  if (
    !settings ||
    !layouts.includes(settings.layout) ||
    !Number.isFinite(settings.tracking) ||
    !Number.isFinite(settings.leading)
  )
    throw Error("Invalid global settings");
  for (const r of p.rounds) {
    if (
      typeof r.id !== "string" ||
      typeof r.name !== "string" ||
      !Array.isArray(r.marks) ||
      r.marks.length > 2500
    )
      throw Error("Invalid collection");
    r.marks.forEach(validateDesign);
  }
  if (p.selected) validateDesign(p.selected);
  if (
    !Array.isArray(p.folders) ||
    p.folders.length > 30 ||
    p.folders.some((f) => typeof f !== "string" || f.length > 4000)
  )
    throw Error("Invalid font folders");
  if (
    p.uploaded &&
    (!Array.isArray(p.uploaded) ||
      p.uploaded.length > 5000 ||
      p.uploaded.some((f) => typeof f !== "string" || f.length > 4000))
  )
    throw Error("Invalid uploaded font paths");
  if (!Number.isInteger(p.seed)) throw Error("Invalid random seed");
  return p;
}
