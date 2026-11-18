import { catalog } from "./catalog.mjs";
import { compose } from "./compose.mjs";
import { variations, validateDesign } from "../web/model.js";
import readline from "node:readline";
import { generate, listFonts } from "./core.mjs";
export const requestSchema = {
  type: "object",
  properties: {
    names: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 8,
      description:
        "Brand names. Alternate between names unless combine is true.",
    },
    count: { type: "integer", enum: [10, 50, 100, 250], default: 50 },
    combine: {
      type: "boolean",
      default: false,
      description: "Stack all supplied names in every lockup.",
    },
    fontDirectory: {
      type: "string",
      description: "Local font directory; omitted uses installed fonts.",
    },
    fontFiles: { type: "array", items: { type: "string" } },
    seed: { type: "integer", default: 9000 },
    excludeFamilies: { type: "array", items: { type: "string" } },
    fonts: {
      type: "array",
      items: { type: "string" },
      description: "Optional font IDs from list_fonts.",
    },
  },
  required: ["names"],
  additionalProperties: false,
};
export async function mcp() {
  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  for await (const line of input) {
    let msg;
    try {
      msg = JSON.parse(line);
      if (msg.id === undefined) continue;
      let result;
      if (msg.method === "initialize")
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "logotyper", version: "2.1.0" },
        };
      else if (msg.method === "ping") result = {};
      else if (msg.method === "tools/list")
        result = {
          tools: [
            {
              name: "generate_wordmarks",
              description:
                "the v1 of your wordmark 9000x faster. Generate 10, 50, 100, or 250 local wordmark lockups and return HTML, outlined SVG, PNG, boards, and a ZIP.",
              inputSchema: requestSchema,
            },
            {
              name: "list_fonts",
              description:
                "List compatible local font families and IDs, using system fonts or a supplied directory.",
              inputSchema: requestSchema,
            },
            {
              name: "catalog_fonts",
              description:
                "Discover categorized local fonts for live preview. Returns stable IDs for compose_mark. No font installation or model call.",
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { enum: ["system", "folder", "files"] },
                        path: { type: "string" },
                        paths: { type: "array", items: { type: "string" } },
                      },
                      required: ["type"],
                    },
                  },
                },
              },
            },
            {
              name: "compose_mark",
              description:
                "Export positioned text elements as real outlined SVG and PNG. Resolve font IDs with catalog_fonts in this session first. Returns local file paths.",
              inputSchema: {
                type: "object",
                properties: {
                  words: {
                    type: "array",
                    minItems: 1,
                    maxItems: 160,
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        fontId: { type: "string" },
                        x: { type: "number" },
                        y: { type: "number" },
                        size: { type: "number" },
                        tracking: { type: "number" },
                        rotation: { type: "number" },
                        stroke: { type: "number" },
                        outline: { type: "boolean" },
                      },
                      required: [
                        "text",
                        "fontId",
                        "x",
                        "y",
                        "size",
                        "tracking",
                        "rotation",
                        "stroke",
                        "outline",
                      ],
                    },
                  },
                },
                required: ["words"],
              },
            },
            {
              name: "iterate_mark",
              description:
                "Return ten deterministic spacing variations of a design, preserving positioned letterforms. No model or rendering required.",
              inputSchema: {
                type: "object",
                properties: {
                  design: { type: "object" },
                  count: {
                    type: "integer",
                    minimum: 1,
                    maximum: 250,
                    default: 10,
                  },
                },
                required: ["design"],
              },
            },
          ],
        };
      else if (msg.method === "tools/call") {
        const { name, arguments: args = {} } = msg.params || {};
        if (
          ![
            "generate_wordmarks",
            "list_fonts",
            "catalog_fonts",
            "compose_mark",
            "iterate_mark",
          ].includes(name)
        )
          throw new Error("Unknown tool");
        try {
          const data =
            name === "catalog_fonts"
              ? await catalog(args)
              : name === "compose_mark"
                ? await compose(args)
                : name === "iterate_mark"
                  ? variations(validateDesign(args.design), args.count ?? 10)
                  : name === "list_fonts"
                    ? await listFonts(args)
                    : await generate(args);
          result = { content: [{ type: "text", text: JSON.stringify(data) }] };
        } catch (e) {
          result = {
            isError: true,
            content: [{ type: "text", text: e.message }],
          };
        }
      } else {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: "Method not found" },
          }) + "\n",
        );
        continue;
      }
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n",
      );
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg?.id ?? null,
          error: { code: -32600, message: e.message },
        }) + "\n",
      );
    }
  }
}
