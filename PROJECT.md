# logotyper

Description: the v1 of your wordmark 9000x faster

A local macOS typography workbench. Browse brand text in live fonts; filter, shuffle, collect, make deterministic variations, refine words/letters, then export outlined SVG and PNG. System fonts, multiple local folders/uploads, and a labelled Google starter catalog. Adobe/paid provider panels disclose licensing and onboarding; they are not connected integrations. Agent suggestions use explicit brief/patch files, alongside CLI, HTTP and MCP.

Built on the original wordmark-generator repository. Legacy 10/50/100/250 batch generation, portable skill, workflow and Figma importer remain compatible. No user source fonts, accounts or credentials are bundled. Geist Pixel Square is bundled solely for UI chrome with its SIL OFL license. Font licensing remains the user's responsibility.

Platform: macOS, Node 22+, Swift/CoreText/CoreGraphics. No npm runtime dependencies. Browser SVG text is the immediate preview; native outline generation is deferred to export. Bounded 24-card paging and four concurrent near-viewport font loads keep preview work limited. UI uses a classic Mac grayscale workbench, left source controls, center previews and right inspector inspired by the sibling geometry tools; mobile panels focus the workspace.

Repository: AlexBloom/logotyper, public. dev is development/default; main is protected and updated via PR. No production deployment or domain requested. See README.md for capabilities and limits, docs/AGENT_API.md for interoperability and STATUS.md for validation.
