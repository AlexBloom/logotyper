## Live workbench / v2

`GET /` is logotyper. The previous app remains at `/batch.html`. No model is invoked by live previews, deterministic ranking/shuffle, collection rounds, layout changes, or ten-step variations.

### Discover fonts

`POST /api/catalog` or MCP `catalog_fonts`:

```json
{"text":"Acme Studio","sources":[{"type":"system"},{"type":"folder","path":"/absolute/fonts"},{"type":"files","paths":["/absolute/font.otf"]}]}
```

Returns `{fonts:[...]}` over HTTP (an array through CLI/MCP). Records contain opaque stable `id`, `family`, PostScript `face`, `category`, `tags`, `weight`, `width`, `classification`, source label, and `previewUrl`. Directory discovery is recursive, checks requested character coverage and selects one face per family. Metadata and filename hints are imperfect; unknown categories are `other`. Font IDs in this catalog differ from the legacy batch IDs. The server keeps a registry for preview/export; a restarted process needs the sources reindexed. GET `/api/font/:id` serves only discovered font assets to the local browser. TTC faces are isolated where possible; system previews can use native local-name lookup for named instances.

`GET /api/google` returns the 20-family starter list. Fetching its preview registers a downloaded font for export. Some provider formats are preview-only. Do not assume the full Google catalog or licensed paid-provider integration is available.

### Compose positioned type

`POST /api/compose` or MCP `compose_mark`:

```json
{"words":[{"text":"Acme","fontId":"CATALOG_ID","x":100,"y":300,"size":100,"rotation":0,"tracking":1,"outline":false,"stroke":1.5}]}
```

The stage is **1000 × 650**, coordinates are SVG units with a top-left origin. `y` is the baseline; rotation is in degrees around that element's baseline origin. `tracking` is extra spacing in units at a nominal 100-point size, scaled by `size / 100`. `stroke` is the final stroke width. Each element can have its own font. All fields in the example are required; 1–160 text elements, positive size, finite transforms. Text is preserved. Register IDs with `catalog_fonts` in the same MCP session first.

Returns `{svg,png,project,files:{svg,png,project}}`. Relative HTTP URLs work with the local server; `files` contains absolute paths for headless agents. SVG has real path outlines; PNG is 2000 × 1300 on white. `project` is the submitted document (or optional `project` field), not a new batch manifest. In the GUI it is a full re-openable project. `POST /api/compose/illustrator` with `{svg:"/outputs/UUID/mark.svg"}` opens an existing exported SVG in local Illustrator; this is an explicit external-app action.

CLI equivalents (all success output is JSON):

```sh
node bin/wordmark.mjs catalog --request sources.json
node bin/wordmark.mjs compose --request positioned-mark.json
node bin/wordmark.mjs iterate --request iteration.json
```

A CLI compose request also supplies `sources` so the new process can resolve the stable IDs. Discovery runs for each distinct element's text, allowing mixed text/symbol fonts. `iterate` accepts `{design,count:10}`; its design is a GUI v2 design, not the positioned-export request. Variation IDs are unique, while settings/spacing deltas repeat deterministically.

### Browser design documents and agent suggestions

`web/model.js` exports the shared deterministic functions `seeded`, `similar`, `makeDesign`, `plan`, `variations`, `applyPatch`, and project validators. A design stores `text,fontId,layout,tracking,leading,rotation,outline,stroke,offset,overrides`, or explicit `elements` after letter editing/dragging. `plan` takes a text measurement function; the browser uses actual loaded-font canvas metrics. Collection rounds are independent snapshots with parent IDs. Global changes affect the active round; frozen ancestors remain unchanged.

**Copy / download agent brief** exports the current design and available fonts. Return a JSON object like:

```json
{"patch":{"layout":"stacked","tracking":1.2,"leading":1.1}}
```

Allowed fields: `text,fontId,layout,tracking,leading,rotation,outline,stroke,offset`. Layout is `lines`, `horizontal`, `stacked`, `offset`, or `initial`. `lines` preserves typed returns and blank rows while retaining per-word controls; `horizontal` flattens whitespace without modifying stored text. Import validates IDs and bounds, asks the user to apply the patch, and records undo history. Font/text/layout patches rebuild explicit positioned elements; appearance patches retain them. There is no implicit network model connection. Agents should recommend only supplied font IDs and preserve requested spelling.

Project JSON contains local font paths and brand work. Do not publish it or upload it to a model without the user's intended authorization. Source fonts are never packaged in SVG/PNG exports. Users remain responsible for their own font licensing.
