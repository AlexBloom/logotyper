# Agent interface

This tool is deterministic typography software, not a prompt-to-image service. The batch request object works through CLI, HTTP, and MCP. Live browsing and positioned export use the v2 contracts below. It reads fonts available to the local macOS process. It does not install fonts or change agent settings.

## Request / result

The canonical request schema is [request.schema.json](request.schema.json).

- `names`: required array of 1–8 nonempty strings, maximum 100 characters per name.
- `combine`: false alternates between names; true places every name in each lockup.
- `count`: 10, 50, 100, 250 (default 50).
- `fontDirectory`: optional recursive local directory. Omit to use system fonts.
- `fontFiles`: optional array of explicit TTF/OTF/TTC/OTC/DFONT paths.
- `fonts`: optional font IDs from discovery.
- `excludeFamilies`: family names to avoid, useful when continuing a previous batch.
- `seed`: 32-bit integer (default 9000).

Generation returns `schemaVersion`, `names`, `count`, `uniqueFamilies`, `seed`, `variants`, `boards`, `licensing`, `output`, `preview`, and `archive`. Each variant has a number, names, font family, PostScript font name, optional source path, treatment, and SVG/PNG filenames. Source font paths can be personal filesystem data: do not publish manifests without reviewing them. Font files are never bundled in an export.

The font inventory filters character coverage and deduplicates by family. Font formats with legacy symbol encodings may produce unusual glyph shapes despite successful coverage checks. Inspect rendered boards before choosing a final identity. Invalid or unreadable font files are skipped; a source with no compatible families returns an error. Different OS/font inventories can change results even with the same seed.

## CLI

```sh
node bin/wordmark.mjs generate --request /absolute/request.json --out /absolute/new-output-dir
node bin/wordmark.mjs generate --stdin < request.json
node bin/wordmark.mjs fonts --font-dir /absolute/fonts --name "Brand"
```

CLI success is JSON on stdout. Errors are JSON on stderr with a nonzero exit code. The supplied output directory must not already exist. Without `--out`, a unique directory under `.wordmark/outputs/` is used. ZIP is a sibling file. HTML can be opened directly or served by any local static server.

## HTTP

Start `node bin/wordmark.mjs serve --port 9000`. It binds to `127.0.0.1`. Browser requests from foreign origins/hosts are rejected. No authentication token is needed for local tools. Do not expose the port publicly.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/health` | Version and platform |
| POST | `/api/fonts` | Request → `{fonts: [{id, family, name, source?}]}` |
| POST | `/api/upload` | `{files: [{name, data: BASE64}]}` → `{fontFiles, count}` |
| POST | `/api/generate` | Request → 202 `{id, status, statusUrl}` |
| GET | `/api/jobs/:id` | Current session job status: `running`, `complete`, `failed` |
| POST | `/api/export` | `{id, numbers: [1,2]}` → selection SVG `url` and local `path` |
| POST | `/api/illustrator` | Same selection; opens generated SVG using the installed Illustrator app |
| GET | `/outputs/:id/:file` | Generated artifacts; add `?download` for attachment |
| GET | `/outputs/:id.zip` | ZIP download |

Only one generation runs at a time through HTTP; a second gets 409. Poll at a reasonable interval, e.g. 1–2 seconds. Jobs are remembered for the current server session, while exported files persist. The UI uploads fonts in batches; each request has a 48 MB limit and up to 100 files. Fonts are stored under `.wordmark/uploads` without global installation. There is no automatic deletion of user assets.

## MCP

`node bin/wordmark.mjs mcp` is a newline-delimited stdio JSON-RPC server using the MCP `2024-11-05` initialization handshake. Newer clients must support version fallback. No Streamable HTTP or modern stateless MCP transport is implemented in v1.

Tools: `generate_wordmarks` and `list_fonts` use the batch schema. `catalog_fonts`, `compose_mark`, and `iterate_mark` use the live contracts below. Tool failures return `isError: true`; protocol errors use JSON-RPC errors. Startup/build diagnostics stay off stdout. A generation can take several minutes for a large source; set the client's tool timeout accordingly.

## Agent skill and contributor handoff

The `skills/wordmark-generator/SKILL.md` package can be used by agents that support the standard skill-folder convention. `npm run install:skill` copies a self-contained runtime to the local skill installation. `AGENTS.md` is the cross-agent contributor entry point; `CLAUDE.md` imports it. No automatic third-party account connection is required.

Users are responsible for their own font licensing.

## Live workbench / v2

`GET /` is mark this word. The previous app remains at `/batch.html`. No model is invoked by live previews, deterministic ranking/shuffle, collection rounds, layout changes, or ten-step variations.

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
