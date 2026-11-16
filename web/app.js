import {
  seeded,
  similar,
  makeDesign,
  plan,
  variations,
  applyPatch,
  validateProject,
} from "./model.js";
const $ = (s) => document.querySelector(s),
  NS = "http://www.w3.org/2000/svg";
let fonts = [],
  selected = null,
  mode = "browse",
  limit = 24,
  category = "all",
  tag = "",
  related = null,
  folders = [],
  uploaded = [],
  epoch = 0,
  elementIndex = 0;
let settings = { tracking: 0, leading: 1.15, layout: "horizontal" },
  rounds = [{ id: crypto.randomUUID(), name: "Round 1", marks: [] }],
  roundId = rounds[0].id,
  past = [],
  future = [];
const loaded = new Map(),
  fontErrors = new Map(),
  knownFonts = new Map();
let loadQueue = [],
  loading = 0;
const context = document.createElement("canvas").getContext("2d");
function note(s = "") {
  $("#notice").hidden = !s;
  $("#notice").textContent = s;
}
async function api(url, data) {
  const res = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value = await res.json();
  if (!res.ok) throw Error(value.error || "Request failed");
  return value;
}
function font(id) {
  return knownFonts.get(id) || fonts.find((f) => f.id === id);
}
function family(id) {
  return "mtw_" + id.replace(/[^a-z0-9]/gi, "_");
}
function loadFont(f) {
  if (loaded.has(f.id)) return loaded.get(f.id);
  const promise = new Promise((resolve, reject) => {
    loadQueue.push({ f, resolve, reject });
    pump();
  });
  loaded.set(f.id, promise);
  return promise;
}
async function pump() {
  while (loading < 4 && loadQueue.length) {
    const task = loadQueue.shift();
    loading++;
    (async () => {
      try {
        let face;
        if (task.f.source === "system") {
          try {
            face = new FontFace(
              family(task.f.id),
              `local("${task.f.localName.replaceAll('"', "")}")`,
            );
            await face.load();
          } catch {
            face = null;
          }
        }
        if (!face && (task.f.source === "google" || task.f.previewUrl)) {
          const res = await fetch(
            task.f.source === "google"
              ? "/api/font/" + encodeURIComponent(task.f.id)
              : task.f.previewUrl,
          );
          if (!res.ok) throw Error("Font file unavailable");
          if (res.headers.get("X-Can-Export") === "false")
            task.f.canExport = false;
          face = new FontFace(family(task.f.id), await res.arrayBuffer());
        } else if (!face)
          face = new FontFace(
            family(task.f.id),
            `local("${task.f.localName.replaceAll('"', "")}" )`,
          );
        await face.load();
        document.fonts.add(face);
        task.resolve(face);
      } catch (e) {
        fontErrors.set(task.f.id, e.message);
        task.reject(e);
      } finally {
        loading--;
        pump();
      }
    })();
  }
}
function measure(text, id, tracking = 0) {
  context.font = `100px "${family(id)}"`;
  return (
    context.measureText(text).width +
    Math.max(0, Array.from(text).length - 1) * tracking
  );
}
function wordsFor(d) {
  return plan(d, measure);
}
function draw(svg, d, interactive = false) {
  svg.replaceChildren();
  const words = wordsFor(d);
  words.forEach((w, i) => {
    const t = document.createElementNS(NS, "text");
    t.textContent = w.text;
    t.setAttribute("x", w.x);
    t.setAttribute("y", w.y);
    t.setAttribute("font-family", family(w.fontId));
    t.setAttribute("font-size", w.size || 100);
    t.setAttribute("letter-spacing", (w.tracking * (w.size || 100)) / 100);
    t.setAttribute("transform", `rotate(${w.rotation} ${w.x} ${w.y})`);
    t.setAttribute("font-kerning", "normal");
    t.style.whiteSpace = "pre";
    if (w.outline) {
      t.style.fill = "none";
      t.style.stroke = "#292b24";
      t.style.strokeWidth = w.stroke;
    }
    if (interactive) {
      t.dataset.index = i;
      t.style.cursor = "grab";
      if (i === elementIndex) {
        t.style.filter = "drop-shadow(0 2px 0 #52694b22)";
      }
      t.onpointerdown = (e) => startDrag(e, i);
    }
    svg.append(t);
  });
}
function state() {
  return {
    schemaVersion: 2,
    text: $("#words").value,
    settings,
    rounds,
    roundId,
    folders,
    uploaded,
    seed: Number($("#seed").value),
    sources: {
      system: $("#system").checked,
      folders: $("#folders-enabled").checked,
      google: $("#google").checked,
    },
    selected,
    fonts: fonts.map((f) => ({
      id: f.id,
      family: f.family,
      face: f.face,
      source: f.source,
    })),
    mode,
  };
}
function persist() {
  $("#export-links").replaceChildren();
  try {
    localStorage.setItem("mark-this-word-project-v2", JSON.stringify(state()));
  } catch {
    note("Browser storage is full. Save your project file to keep this work.");
  }
}
function checkpoint() {
  past.push(
    structuredClone({
      settings,
      rounds,
      roundId,
      selected,
      text: $("#words").value,
    }),
  );
  past = past.slice(-80);
  future = [];
}
function restore(s) {
  settings = s.settings;
  rounds = s.rounds;
  roundId = s.roundId;
  selected = s.selected;
  $("#words").value = s.text;
  syncSettings();
  render();
  inspect();
  persist();
}
function setMode(next) {
  if (mode !== next) limit = 24;
  mode = next;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  render();
  persist();
}
function activeRound() {
  return rounds.find((r) => r.id === roundId) || rounds.at(-1);
}
function syncSettings() {
  for (const k of ["tracking", "leading", "layout"])
    $("#" + k).value = settings[k];
  $("#tracking-value").textContent = settings.tracking;
  $("#leading-value").textContent = settings.leading;
}
function candidates() {
  let items = related || fonts;
  items = items.filter(
    (f) =>
      (category === "all" || f.category === category) &&
      (!tag || (f.tags || []).includes(tag)) &&
      `${f.family} ${(f.tags || []).join(" ")}`
        .toLowerCase()
        .includes($("#search").value.toLowerCase()),
  );
  return related ? items : seeded(items, Number($("#seed").value));
}
let observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries)
      if (e.isIntersecting) {
        observer.unobserve(e.target);
        hydrate(e.target);
      }
  },
  { rootMargin: "350px" },
);
async function hydrate(card) {
  const d = card.design;
  try {
    await Promise.all(
      [...new Set(wordsFor(d).map((w) => w.fontId))].map((id) => {
        const f = font(id);
        if (!f) throw Error("Font missing: reload its source");
        return loadFont(f);
      }),
    );
    if (card.isConnected) {
      draw(card.querySelector("svg"), d);
      card.querySelector(".loading-label")?.remove();
    }
  } catch (e) {
    if (card.isConnected)
      card.querySelector(".loading-label").textContent =
        "Unavailable · " + e.message;
  }
}
function card(d, snapshot = false) {
  const f = font(d.fontId),
    el = document.createElement("article");
  el.className = "card";
  el.design = d;
  if (
    selected?.id === d.id ||
    (mode === "browse" && selected?.fontId === d.fontId)
  )
    el.classList.add("selected");
  const head = document.createElement("header"),
    label = document.createElement("span");
  label.textContent = f?.family || "Missing font";
  head.append(label);
  const collect = document.createElement("button");
  collect.textContent = snapshot ? "Remove" : "Collect +";
  collect.onclick = (e) => {
    e.stopPropagation();
    checkpoint();
    if (snapshot)
      activeRound().marks = activeRound().marks.filter((x) => x.id !== d.id);
    else
      activeRound().marks.push({
        ...structuredClone(d),
        id: crypto.randomUUID(),
        parentId: d.id,
      });
    persist();
    if (mode === "collect") render();
    else updateCount();
  };
  head.append(collect);
  const preview = document.createElement("div");
  preview.className = "preview";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 1000 650");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", d.text);
  preview.append(svg);
  const loadingLabel = document.createElement("span");
  loadingLabel.className = "loading-label";
  loadingLabel.textContent = "Loading actual font…";
  preview.append(loadingLabel);
  preview.tabIndex = 0;
  preview.onclick = () => select(d);
  preview.onkeydown = (e) => {
    if (e.key === "Enter") select(d);
    if (e.key === " ") {
      e.preventDefault();
      collect.click();
    }
  };
  const footer = document.createElement("footer");
  footer.textContent =
    d.variation ||
    [f?.category || "other", f?.sourceLabel || "missing source", d.layout].join(
      " · ",
    );
  el.append(head, preview, footer);
  observer.observe(el);
  return el;
}
function updateCount() {
  $("#collection-count").textContent = rounds.reduce(
    (n, r) => n + r.marks.length,
    0,
  );
}
function render() {
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  observer.disconnect();
  $("#grid").replaceChildren();
  $("#grid").hidden = mode === "refine";
  $("#editor").hidden = mode !== "refine";
  $(".more").hidden = mode === "refine";
  $("#round-toolbar").hidden = mode !== "collect";
  updateCount();
  $("#round").replaceChildren(
    ...rounds.map((r) => {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name + " · " + r.marks.length;
      o.selected = r.id === roundId;
      return o;
    }),
  );
  if (mode === "refine") {
    $("#status").textContent = "Live refinement";
    if (!selected) {
      $("#stage").replaceChildren();
      note("Select a promising mark to begin refining.");
    } else paintEditor();
    return;
  }
  const total =
    mode === "collect" ? activeRound().marks.length : candidates().length;
  limit = Math.max(24, Math.min(limit, Math.ceil(total / 24) * 24));
  const start = Math.max(0, limit - 24);
  const items =
    mode === "collect"
      ? activeRound().marks.slice(start, limit)
      : candidates()
          .slice(start, limit)
          .map((f) =>
            makeDesign($("#words").value || "mark this word", f.id, settings),
          );
  for (const d of items) $("#grid").append(card(d, mode === "collect"));
  $("#status").textContent =
    `${total} ${mode === "collect" ? "collected versions" : "families"} · ${total ? start + 1 : 0}–${Math.min(limit, total)}`;
  $("#more").disabled = limit >= total;
  $("#previous").disabled = limit <= 24;
}
async function select(d) {
  selected = structuredClone(d);
  elementIndex = 0;
  render();
  inspect();
  persist();
}
function inspect() {
  const meta = $("#metadata");
  meta.replaceChildren();
  $("#selection-controls").hidden = !selected;
  if (!selected) return;
  const f = font(selected.fontId);
  const title = document.createElement("h3");
  title.textContent = f?.family || "Missing font";
  meta.append(title);
  const dl = document.createElement("dl");
  for (const [k, v] of Object.entries({
    Face: f?.face || selected.fontId,
    Source: f?.sourceLabel || "Resolve source",
    Category: f?.category || "other",
    Classification: f?.classification || "provider metadata",
    Export: f?.canExport === false ? "Preview only" : "Local outline export",
  })) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  }
  meta.append(dl);
  const chips = document.createElement("div");
  chips.className = "chips";
  for (const t of f?.tags || []) {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = () => {
      tag = t;
      setMode("browse");
    };
    chips.append(b);
  }
  meta.append(chips);
  for (const k of ["outline", "rotation", "offset", "stroke"]) {
    const el = $("#" + k);
    if (el.type === "checkbox") el.checked = selected[k];
    else el.value = selected[k];
  }
  updateElements();
}
async function paintEditor() {
  try {
    await Promise.all(
      [...new Set(wordsFor(selected).map((w) => w.fontId))].map((id) => {
        if (!font(id))
          throw Error("Reload the missing font source to edit this mark.");
        return loadFont(font(id));
      }),
    );
    draw($("#stage"), selected, true);
  } catch (e) {
    note(e.message);
  }
}
function updateElements() {
  if (!selected) return;
  const ws = wordsFor(selected);
  const select = $("#element");
  select.replaceChildren(
    ...ws.map((w, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = w.text;
      o.selected = i === elementIndex;
      return o;
    }),
  );
  const fontsSelect = $("#element-font");
  fontsSelect.replaceChildren(
    ...fonts.map((f) => {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.family;
      o.selected = f.id === ws[elementIndex]?.fontId;
      return o;
    }),
  );
  const o = selected.overrides?.[elementIndex] || {};
  $("#element-x").value = selected.elements
    ? ws[elementIndex]?.x || 0
    : o.x || 0;
  $("#element-y").value = selected.elements
    ? ws[elementIndex]?.y || 0
    : o.y || 0;
  $("#element-rotation").value = selected.elements
    ? ws[elementIndex]?.rotation || 0
    : o.rotation || 0;
}
let dragging;
function startDrag(e, i) {
  if (!selected) return;
  e.preventDefault();
  elementIndex = i;
  checkpoint();
  if (!selected.elements) selected.elements = wordsFor(selected);
  const p = $("#stage").createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const point = p.matrixTransform($("#stage").getScreenCTM().inverse());
  dragging = {
    i,
    x: point.x,
    y: point.y,
    old: structuredClone(selected.elements[i]),
  };
  $("#stage").setPointerCapture(e.pointerId);
  updateElements();
}
$("#stage").onpointermove = (e) => {
  if (!dragging) return;
  const p = $("#stage").createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const point = p.matrixTransform($("#stage").getScreenCTM().inverse());
  selected.elements[dragging.i].x = dragging.old.x + point.x - dragging.x;
  selected.elements[dragging.i].y = dragging.old.y + point.y - dragging.y;
  draw($("#stage"), selected, true);
};
$("#stage").onpointerup = () => {
  if (dragging) {
    dragging = null;
    updateElements();
    persist();
  }
};
async function refresh() {
  const ticket = ++epoch;
  $("#reload").disabled = true;
  $("#status").textContent = "Indexing fonts…";
  note("");
  const sources = [];
  if ($("#system").checked) sources.push({ type: "system" });
  if ($("#folders-enabled").checked) {
    sources.push(...folders.map((path) => ({ type: "folder", path })));
    if (uploaded.length) sources.push({ type: "files", paths: uploaded });
  }
  try {
    const all = sources.length
      ? (
          await api("/api/catalog", {
            text: $("#words").value || "mark this word",
            sources,
          })
        ).fonts
      : [];
    if ($("#google").checked) all.push(...(await api("/api/google")).fonts);
    if (ticket !== epoch) return;
    fonts = all;
    for (const f of fonts) knownFonts.set(f.id, f);
    related = null;
    limit = 24;
    $("#inventory-status").textContent =
      `${fonts.length} compatible families. A face is loaded only when its preview is near the screen.`;
    const tags = [...new Set(fonts.flatMap((f) => f.tags || []))];
    $("#tags").replaceChildren(
      ...tags.map((t) => {
        const b = document.createElement("button");
        b.textContent = t;
        b.onclick = () => {
          tag = tag === t ? "" : t;
          limit = 24;
          render();
        };
        return b;
      }),
    );
    if (!fonts.length)
      note("Enable a source or choose a font folder to begin.");
    render();
    inspect();
    persist();
  } catch (e) {
    if (ticket === epoch) {
      note(e.message);
      $("#status").textContent = "Source needs attention";
    }
  } finally {
    if (ticket === epoch) $("#reload").disabled = false;
  }
}
function folderList() {
  $("#folder-list").replaceChildren(
    ...folders.map((p, i) => {
      const row = document.createElement("div");
      row.className = "folder-chip";
      const text = document.createElement("span");
      text.textContent = p;
      const b = document.createElement("button");
      b.textContent = "×";
      b.onclick = () => {
        folders.splice(i, 1);
        folderList();
        refresh();
      };
      row.append(text, b);
      return row;
    }),
  );
}
$("#add-folder").onclick = () => {
  const p = $("#folder-path").value.trim();
  if (!p) return;
  if (!folders.includes(p)) folders.push(p);
  $("#folder-path").value = "";
  $("#folders-enabled").checked = true;
  folderList();
  refresh();
};
$("#reload").onclick = refresh;
for (const id of ["system", "folders-enabled", "google"])
  $("#" + id).onchange = refresh;
let textTimer;
$("#words").oninput = () => {
  if (selected && !selected.elements && mode === "refine")
    selected.text = $("#words").value || "mark this word";
  if (selected?.elements)
    note(
      "This refined mark contains positioned letterforms. Return to Browse to start a new text exploration.",
    );
  render();
  clearTimeout(textTimer);
  textTimer = setTimeout(refresh, 650);
  persist();
};
$("#search").oninput = () => {
  limit = 24;
  render();
};
for (const b of document.querySelectorAll("[data-category]"))
  b.onclick = () => {
    category = b.dataset.category;
    document
      .querySelectorAll("[data-category]")
      .forEach((x) => x.classList.toggle("active", x === b));
    limit = 24;
    render();
  };
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => setMode(b.dataset.mode);
$("#more").onclick = () => {
  limit += 24;
  render();
  $("#grid").scrollIntoView({ block: "start" });
};
$("#previous").onclick = () => {
  limit = Math.max(24, limit - 24);
  render();
  $("#grid").scrollIntoView({ block: "start" });
};
$("#shuffle").onclick = () => {
  $("#seed").value = Number($("#seed").value) + 1;
  limit = 24;
  render();
  persist();
};
$("#seed").onchange = () => {
  render();
  persist();
};
$("#reset").onclick = () => {
  checkpoint();
  category = "all";
  tag = "";
  related = null;
  $("#search").value = "";
  $("#seed").value = 9000;
  settings = { tracking: 0, leading: 1.15, layout: "horizontal" };
  syncSettings();
  document
    .querySelectorAll("[data-category]")
    .forEach((b) => b.classList.toggle("active", b.dataset.category === "all"));
  render();
  persist();
};
for (const k of ["tracking", "leading", "layout"]) {
  $("#" + k).onpointerdown = checkpoint;
  $("#" + k).oninput = () => {
    settings[k] = k === "layout" ? $("#" + k).value : Number($("#" + k).value);
    if (selected && mode === "refine") {
      if (selected.elements) {
        if (k === "tracking")
          selected.elements.forEach((w) => (w.tracking = settings.tracking));
        if (k === "leading") {
          const old = selected.leading || 1.15;
          const min = Math.min(...selected.elements.map((w) => w.y));
          selected.elements.forEach(
            (w) => (w.y = min + ((w.y - min) * settings.leading) / old),
          );
        }
        if (k === "layout") delete selected.elements;
      }
      selected[k] = settings[k];
      paintEditor();
      updateElements();
    } else {
      if (mode === "collect")
        activeRound().marks = activeRound().marks.map((d) =>
          applyPatch(d, { [k]: settings[k] }),
        );
      render();
    }
    syncSettings();
    persist();
  };
}
$("#like").onclick = () => {
  const f = font(selected?.fontId);
  if (!f) return;
  related = similar(f, fonts);
  category = "all";
  tag = "";
  document
    .querySelectorAll("[data-category]")
    .forEach((b) => b.classList.toggle("active", b.dataset.category === "all"));
  $("#search").value = "";
  $("#similarity").hidden = false;
  $("#similarity").replaceChildren(
    document.createTextNode(
      "Related to " + f.family + " · category, tags, weight and width",
    ),
  );
  const b = document.createElement("button");
  b.textContent = "Clear similarity";
  b.onclick = () => {
    related = null;
    $("#similarity").hidden = true;
    render();
  };
  $("#similarity").append(b);
  setMode("browse");
};
$("#refine").onclick = () => setMode("refine");
$("#clear-selection").onclick = () => {
  selected = null;
  inspect();
  render();
};
$("#vary").onclick = () => {
  if (!selected) return;
  checkpoint();
  const children = variations(selected);
  rounds.push({
    id: crypto.randomUUID(),
    name: "Variations of " + (font(selected.fontId)?.family || "mark"),
    parentId: roundId,
    marks: children,
  });
  roundId = rounds.at(-1).id;
  setMode("collect");
  persist();
};
$("#collect-edit").onclick = () => {
  if (!selected) return;
  checkpoint();
  activeRound().marks.push({
    ...structuredClone(selected),
    id: crypto.randomUUID(),
    parentId: selected.id,
  });
  updateCount();
  persist();
  $("#status").textContent = "Version collected";
};
$("#round").onchange = () => {
  roundId = $("#round").value;
  render();
};
$("#next-round").onclick = () => {
  checkpoint();
  rounds.push({
    id: crypto.randomUUID(),
    name: "Round " + (rounds.length + 1),
    parentId: roundId,
    marks: activeRound().marks.map((d) => ({
      ...structuredClone(d),
      id: crypto.randomUUID(),
      parentId: d.id,
    })),
  });
  roundId = rounds.at(-1).id;
  render();
  persist();
};
$("#compare-parent").onclick = () => {
  const parent = activeRound().parentId;
  if (parent) {
    roundId = parent;
    render();
  } else note("This is the first round.");
};
for (const k of ["outline", "stroke", "offset", "rotation"]) {
  $("#" + k).onpointerdown = checkpoint;
  $("#" + k).oninput = () => {
    if (!selected) return;
    selected[k] =
      k === "outline" ? $("#" + k).checked : Number($("#" + k).value);
    if (selected.elements)
      selected.elements.forEach((w) => {
        if (["outline", "stroke", "rotation"].includes(k)) w[k] = selected[k];
      });
    setMode("refine");
    persist();
  };
}
$("#element").onchange = () => {
  elementIndex = Number($("#element").value);
  updateElements();
};
function updateElement(key, value) {
  if (!selected) return;
  checkpoint();
  if (selected.elements) selected.elements[elementIndex][key] = value;
  else {
    selected.overrides ||= {};
    selected.overrides[elementIndex] ||= {};
    selected.overrides[elementIndex][key] = value;
  }
  setMode("refine");
  persist();
}
$("#element-font").onchange = () =>
  updateElement("fontId", $("#element-font").value);
for (const k of ["x", "y", "rotation"])
  $("#element-" + k).onchange = () =>
    updateElement(k, Number($("#element-" + k).value));
$("#explode").onclick = () => {
  if (!selected) return;
  checkpoint();
  const ws = wordsFor(selected),
    w = ws[elementIndex];
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      w.text,
    ),
  ].map((s) => s.segment);
  let prefix = "";
  const letters = segments
    .filter((c) => {
      return c;
    })
    .map((c) => {
      const distance =
          ((measure(prefix, w.fontId, w.tracking) + (prefix ? w.tracking : 0)) *
            (w.size || 100)) /
          100,
        angle = (w.rotation * Math.PI) / 180;
      prefix += c;
      return {
        ...w,
        text: c,
        x: w.x + Math.cos(angle) * distance,
        y: w.y + Math.sin(angle) * distance,
      };
    })
    .filter((w) => w.text.trim());
  selected.elements = [
    ...ws.slice(0, elementIndex),
    ...letters,
    ...ws.slice(elementIndex + 1),
  ];
  elementIndex = 0;
  note(
    "Letter mode preserves an editable word ancestor in Undo. Ligatures may separate when editing individual letterforms.",
  );
  setMode("refine");
  inspect();
  persist();
};
$("#duplicate-element").onclick = () => {
  if (!selected) return;
  checkpoint();
  selected.elements = wordsFor(selected);
  const w = selected.elements[elementIndex];
  selected.elements.push({ ...w, x: w.x + 25, y: w.y + 25 });
  setMode("refine");
  updateElements();
  persist();
};
$("#add-dingbat").onclick = () => {
  const text = $("#dingbat").value.trim();
  if (!selected || !text) return;
  checkpoint();
  selected.elements = wordsFor(selected);
  selected.elements.push({
    text,
    fontId: selected.fontId,
    size: 100,
    x: 100,
    y: 550,
    rotation: 0,
    tracking: 0,
    outline: false,
    stroke: 1.5,
  });
  setMode("refine");
  updateElements();
  persist();
};
function download(name, data, type = "application/json") {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$("#save").onclick = () =>
  download("mark-this-word-project.json", JSON.stringify(state(), null, 2));
$("#open").onclick = () => $("#project-file").click();
$("#project-file").onchange = async (e) => {
  try {
    const p = validateProject(JSON.parse(await e.target.files[0].text()));
    checkpoint();
    rounds = p.rounds;
    roundId = p.roundId;
    settings = p.settings;
    selected = p.selected;
    folders = p.folders || [];
    uploaded = p.uploaded || [];
    $("#words").value = p.text;
    for (const k of ["system", "google"])
      $("#" + k).checked = p.sources?.[k] ?? false;
    $("#folders-enabled").checked = p.sources?.folders ?? false;
    syncSettings();
    folderList();
    mode = "collect";
    await refresh();
    note(
      "Project opened. Fonts must be available from their original sources; dropped files may need to be chosen again.",
    );
  } catch (e) {
    note(e.message);
  }
};
$("#undo").onclick = () => {
  if (!past.length) return;
  future.push(
    structuredClone({
      settings,
      rounds,
      roundId,
      selected,
      text: $("#words").value,
    }),
  );
  restore(past.pop());
};
$("#redo").onclick = () => {
  if (!future.length) return;
  past.push(
    structuredClone({
      settings,
      rounds,
      roundId,
      selected,
      text: $("#words").value,
    }),
  );
  restore(future.pop());
};
$("#export-svg").onclick = async () => {
  if (!selected) return;
  const b = $("#export-svg");
  b.disabled = true;
  note("");
  try {
    const words = wordsFor(selected);
    await Promise.all(words.map((w) => loadFont(font(w.fontId))));
    const result = await api("/api/compose", {
      schemaVersion: 2,
      design: selected,
      words,
      project: state(),
    });
    $("#export-links").replaceChildren(
      ...["svg", "png", "project"].map((k) => {
        const a = document.createElement("a");
        a.href = result[k] + "?download";
        a.download = true;
        a.textContent = k.toUpperCase() + " ↓";
        return a;
      }),
    );
    const illustrator = document.createElement("button");
    illustrator.textContent = "Open in Illustrator ↗";
    illustrator.onclick = async () => {
      try {
        await api("/api/compose/illustrator", { svg: result.svg });
      } catch (e) {
        note(e.message);
      }
    };
    const figma = document.createElement("button");
    figma.textContent = "Send to Figma ↗";
    figma.onclick = async () => {
      try {
        const text = await (await fetch(result.svg)).text();
        await navigator.clipboard.writeText(text);
        note(
          "Outlined SVG copied. Paste into Figma, or download SVG and drag it onto the canvas.",
        );
      } catch {
        note("Download the SVG and drag it onto your Figma canvas.");
      }
    };
    $("#export-links").append(figma, illustrator);
    $("#status").textContent = "Outlined export ready";
  } catch (e) {
    note(e.message);
  } finally {
    b.disabled = false;
  }
};
const providers = {
  adobe: [
    "Adobe Fonts — custom integration required",
    "A Creative Cloud subscription is not a general font-authoring API license. Customer-driven font applications require an appropriate agreement. No account is connected here. You can browse your own permitted local fonts using the system source.",
    "https://helpx.adobe.com/fonts/web/font-licensing/font-licensing.html",
  ],
  premium: [
    "Premium font libraries",
    "Monotype documents font preview, search and similarity APIs, subject to commercial onboarding and permissions. This adapter is not connected yet. User-licensed local foundry files can be chosen through Font folders.",
    "https://www.monotype.com/fonts-api",
  ],
};
for (const id of Object.keys(providers))
  $("#" + id).onclick = () => {
    const [title, text, url] = providers[id];
    $("#provider-title").textContent = title;
    $("#provider-text").textContent = text;
    $("#provider-link").href = url;
    $("#provider-dialog").showModal();
  };
$("#close-dialog").onclick = () => $("#provider-dialog").close();
$("#agent-brief").onclick = async () => {
  const brief = {
    task: "Recommend available fonts or propose a reversible settings patch for this mark. Do not invent font IDs.",
    schemaVersion: 2,
    text: $("#words").value,
    selected,
    availableFonts: fonts.map(({ id, family, category, tags }) => ({
      id,
      family,
      category,
      tags,
    })),
    patchFields: [
      "fontId",
      "layout",
      "tracking",
      "leading",
      "rotation",
      "outline",
      "stroke",
      "offset",
    ],
    responseFormat: {
      patch: { layout: "stacked", tracking: 0, leading: 1.15 },
    },
  };
  const text = JSON.stringify(brief, null, 2);
  download("mark-this-word-agent-brief.json", text);
  try {
    await navigator.clipboard.writeText(text);
    note(
      "Agent brief downloaded and copied. Ask your agent to return a JSON object with a patch field.",
    );
  } catch {
    note("Agent brief downloaded.");
  }
};
$("#agent-import").onclick = () => $("#agent-file").click();
$("#agent-file").onchange = async (e) => {
  try {
    if (!selected) throw Error("Select a mark before importing a suggestion");
    const data = JSON.parse(await e.target.files[0].text());
    const next = applyPatch(selected, data.patch || data);
    if (!font(next.fontId))
      throw Error("Suggested font is not in the enabled sources");
    if (
      !confirm("Apply this suggestion? " + JSON.stringify(data.patch || data))
    )
      return;
    checkpoint();
    selected = next;
    setMode("refine");
    inspect();
    persist();
  } catch (e) {
    note(e.message);
  }
};
async function upload(files) {
  const usable = [...files].filter((f) =>
    /\.(ttf|otf|ttc|otc|dfont)$/i.test(f.name),
  );
  if (!usable.length) return note("No supported font files found");
  try {
    for (let i = 0; i < usable.length; i += 8) {
      const batch = await Promise.all(
        usable.slice(i, i + 8).map(async (f) => ({
          name: f.name,
          data: await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.onerror = reject;
            r.readAsDataURL(f);
          }),
        })),
      );
      uploaded.push(...(await api("/api/upload", { files: batch })).fontFiles);
    }
    $("#folders-enabled").checked = true;
    await refresh();
  } catch (e) {
    note(e.message);
  }
}
$("#drop").onclick = () => $("#font-files").click();
$("#drop").onkeydown = (e) => {
  if (e.key === "Enter") $("#font-files").click();
};
$("#font-files").onchange = (e) => upload(e.target.files);
$("#choose-folder").onclick = () => $("#folder-files").click();
$("#folder-files").onchange = (e) => upload(e.target.files);
$("#drop").ondragover = (e) => {
  e.preventDefault();
  $("#drop").classList.add("drag");
};
$("#drop").ondragleave = () => $("#drop").classList.remove("drag");
async function filesFrom(entry) {
  if (entry.isFile) return [await new Promise((r, j) => entry.file(r, j))];
  let files = [];
  const reader = entry.createReader();
  for (;;) {
    const entries = await new Promise((r, j) => reader.readEntries(r, j));
    if (!entries.length) break;
    for (const child of entries) files.push(...(await filesFrom(child)));
  }
  return files;
}
$("#drop").ondrop = async (e) => {
  e.preventDefault();
  $("#drop").classList.remove("drag");
  try {
    const entries = [...e.dataTransfer.items]
      .map((i) => i.webkitGetAsEntry?.())
      .filter(Boolean);
    await upload(
      entries.length
        ? (await Promise.all(entries.map(filesFrom))).flat()
        : e.dataTransfer.files,
    );
  } catch (e) {
    note(e.message);
  }
};
try {
  const saved = JSON.parse(localStorage.getItem("mark-this-word-project-v2"));
  if (saved?.schemaVersion === 2) {
    validateProject(saved);
    rounds = saved.rounds;
    roundId = saved.roundId;
    settings = saved.settings;
    folders = saved.folders || [];
    uploaded = saved.uploaded || [];
    selected = saved.selected || null;
    mode = ["browse", "collect", "refine"].includes(saved.mode)
      ? saved.mode
      : "browse";
    $("#words").value = saved.text;
    $("#seed").value = saved.seed;
    $("#system").checked = saved.sources?.system ?? true;
    $("#google").checked = saved.sources?.google ?? false;
    $("#folders-enabled").checked = saved.sources?.folders ?? false;
  }
} catch {}
syncSettings();
folderList();
refresh();

for (const b of document.querySelectorAll("[data-panel]"))
  b.onclick = () => {
    document
      .querySelectorAll("aside")
      .forEach((a) =>
        a.classList.toggle(
          "mobile-open",
          a.classList.contains(b.dataset.panel),
        ),
      );
  };
for (const b of document.querySelectorAll("[data-close-panel]"))
  b.onclick = () => b.closest("aside").classList.remove("mobile-open");

$("#remove-element").onclick = () => {
  if (!selected) return;
  const ws = wordsFor(selected);
  if (ws.length === 1) return note("Keep at least one text element.");
  checkpoint();
  selected.elements = ws.filter((_, i) => i !== elementIndex);
  elementIndex = 0;
  setMode("refine");
  updateElements();
  persist();
};
