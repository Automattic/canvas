# Project instructions

- Use Markdown for documentation. Never use Microsoft Docs.
- This repository develops the Canvas WordPress plugin with an independent local Playground. Keep source, configuration, and site data within this project; never mount or edit another project's files.
- Keep the setup minimal. Add features, admin screens, integrations, or additional plugins only when requested.
- Plugin files live at the repository root: `canvas.php`, `src/`, `includes/`, `patterns/`, and `images/`. Preserve unrelated work, including changes made by other tasks.
- Preserve the `PlaygroundPlugin` namespace and `ABSPATH` guard in the plugin entry point.
- Keep `@wp-playground/cli` pinned to `3.1.34` unless an upgrade is requested.
- Start with `npm run dev`; the default port is 9403. WordPress data persists in `.playground/wordpress/`, and the plugin runtime files are mounted separately. Never mount the entire repository into WordPress; use the shared allowlist in `scripts/plugin-paths.mjs`.
- Do not delete or reset `.playground/wordpress/` without an explicit request. Do not commit runtime data or `node_modules/`.
- Run `npm run lint:php` after PHP changes, and verify relevant behavior in the running WordPress instance.
- Install development tools with `npm ci` and `composer install`. Run `npm run check` for unit tests, WPCS, WordPress JavaScript/SCSS linting, and the production build. Keep fixed presentation in SCSS; use inline styles only for authored or measured values. Document any narrowly scoped lint exceptions.
- Keep documentation in `README.md` (development and connections), `AGENTS.md` (project instructions), `readme.txt` (WordPress installation and usage), and `AUTHORING.md` (the bundled authoring contract). Update these instead of adding standalone audit, status, or feature documents. Keep reusable skills in `.agents/skills/`.
- Canvas supports the current `tabor/canvas` format only; do not add migrations or compatibility for earlier experimental formats. Save authored attributes, never derived viewport geometry. Keep JavaScript and PHP serialization in sync.

## Canvas pattern authoring

- For creating or refining Canvas patterns, follow [.agents/skills/pattern-builder/SKILL.md](.agents/skills/pattern-builder/SKILL.md), the source of truth for the workflow. Delegate bounded pattern work to the `pattern-builder` agent defined in [.codex/agents/pattern-builder.toml](.codex/agents/pattern-builder.toml) when the parent has useful independent work, such as reviewing the reference or preparing integration. Otherwise follow the same skill in the current thread.
- Pass the reference or brief, assets, destination, and assigned paths to the agent. If the client cannot select custom agent roles, pass the skill path to a normal sub-agent. If delegation is unavailable, use the skill directly.
