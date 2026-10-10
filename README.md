# Canvas

A WordPress block for moving, resizing, rotating, and layering core blocks in responsive layouts.

**[Try Canvas in WordPress Playground](https://playground.wordpress.net/?blueprint-url=https%3A%2F%2Fplayground.wordpress.net%2Fplugin-proxy.php%3Forg%3DAutomattic%26repo%3Dcanvas%26workflow%3DBuild%20Playground%26branch%3Dtrunk%26artifact%3Dcanvas-playground)**

For reference, [here’s the current editing experience with regular WordPress patterns](https://playground.wordpress.net/?blueprint-url=https%3A%2F%2Fplayground.wordpress.net%2Fplugin-proxy.php%3Forg%3DAutomattic%26repo%3Dcanvas%26workflow%3DBuild%20Playground%26branch%3Dtrunk%26artifact%3Dregular-patterns-playground).

Both Playground links use the latest successful build from `trunk`.

**Install:** download the **canvas** artifact from a successful [build](https://github.com/Automattic/canvas/actions/workflows/playground.yml), extract its `canvas.zip`, then upload that ZIP in WordPress. Versioned downloads can also be published as [release](https://github.com/Automattic/canvas/releases) assets.

**Develop:** clone the repository, run `npm ci`, then `npm run dev`. See [Develop](#develop) for details.

See the [plugin readme](readme.txt) for installation and usage, [project instructions](AGENTS.md) for contributors and agents, and [Canvas authoring instructions](AUTHORING.md) for the saved block format.

## Release status

Canvas 0.1.0 is a team preview for test sites using WordPress 7.1+ and PHP 8.3+. The saved Canvas format is experimental; updates may require recreating experimental layouts. Keep important content on a separate site while evaluating it.

The September 22 package check passed 306 unit tests, PHP syntax checks, production builds, and 24 WordPress ability integration checks. A clean WordPress 7.1.1 site with Twenty Twenty-Five and Canvas as the only active plugin passed ZIP installation/update, pattern save/reload, and image/overflow checks at 320–3840px. Incomplete builds were rejected on activation. That runtime reported PHP 8.5.6; the declared PHP 8.3 minimum and a wider compatibility matrix still need separate runtime checks.

Before a stable public release:
- Complete localization of editor labels and messages; the plugin text domain is `canvas`.
- Record source and redistribution permissions for the bundled images.
- Verify additional themes, browsers, keyboard and screen-reader behavior, touch devices, and the supported WordPress/PHP versions. The unit suite is not a substitute for these checks.

## Develop

Use Node.js 22.13 or newer (Node 20.19 also works):

```sh
git clone https://github.com/Automattic/canvas.git
cd canvas
npm ci
npm run dev
```

Open [wp-admin](http://127.0.0.1:9403/wp-admin/). The launcher builds the block, starts the asset watcher, and runs `@wp-playground/cli@3.1.34` with automatic login. If prompted, use `admin` / `password`. Refresh the editor after changes compile; PHP changes apply on refresh. Ctrl+C stops the launcher and its child processes.

WordPress persists in the ignored `.playground/wordpress/` directory. The launcher mounts only the plugin source, assets, authoring guide, and generated build into WordPress; the local database, Git metadata, dependencies, and development scripts are outside that plugin mount. The Blueprint activates Canvas and MCP Adapter and removes the bundled Akismet and Hello Dolly examples. Do not delete the WordPress directory to restart the server.

Reuse an already-running Playground, or run `npm run watch:blocks` for assets alone. To change ports, stop the original server and use `PORT=9404 npm run dev`; never run two servers against the same persistent site. Use Chrome if an embedded browser does not render the editor canvas.

```sh
npm run check             # Unit tests, coding standards, production build
npm test                  # Layout and interaction unit tests
npm run lint              # PHP, JavaScript, and SCSS standards
npm run lint:php          # PHP syntax and WPCS; requires PHP and composer install
npm run lint:js           # WordPress ESLint, including JSX and ES modules
npm run lint:css          # WordPress Stylelint for SCSS
npm run format:php        # Apply automatic WPCS fixes
npm run format:js         # Apply automatic JavaScript fixes
npm run format:css        # Apply automatic SCSS fixes
npm run build             # Production block assets
npm run package:plugin    # Installable dist/canvas.zip, built in isolation
npm run package:preview   # Plugin ZIP plus a reproducible browser Playground bundle
npm run watch:blocks      # Asset watcher without starting WordPress
npm run demo              # Create or reopen the local draft demonstration
npm run test:abilities    # Isolated WordPress permission and authoring checks
```

The demo command preserves an existing demo and prints its edit link. Ability integration checks create and clean up their own fixtures; run them only while the local server is stopped. Layout changes also need editor save/reload and frontend checks across mobile, tablet, desktop, and intermediate widths.

Run `composer install` before the PHP coding-standard checks or `npm run check`; Composer is not needed to start the local Playground.

Coding standards use the full [WPCS ruleset](https://github.com/WordPress/WordPress-Coding-Standards) in `phpcs.xml.dist` and the WordPress ESLint and Stylelint presets. Composer installs development tools in `vendor/`; they are not shipped with the plugin. PHP checks cover authored plugin files and exclude generated assets. The JavaScript config recognizes imports supplied by WordPress and explicitly lists the existing experimental editor APIs; additional experimental imports fail linting. Local file reads and the atomic write-lock query have narrow, documented WPCS exceptions.

Keep fixed presentation in `style.scss` (shared editor/frontend), `editor.scss` (editor only), or their SCSS partials. Use classes and data attributes for UI state. Inline styles are reserved for measured or authored values such as geometry, typography, and CSS custom properties. Site-defined viewport media queries remain attached through `wp_add_inline_style()`, because CSS media queries cannot read custom properties. Native block markup in patterns retains WordPress's serialized style attributes.

### Codex environment

[The Canvas environment](.codex/environments/environment.toml) installs the locked npm and Composer dependencies and builds the plugin when Codex sets up a worktree. Node.js, PHP, and Composer must be available on your PATH.

Use **Run** for `npm run dev` and **Check** for `npm run check`. Each worktree keeps its own WordPress site in `.playground/wordpress/`; setup does not copy an existing site. If another checkout is using port 9403, start this worktree from its terminal with `PORT=9404 npm run dev`. No cleanup script is configured.

## Install the plugin elsewhere

Run `npm ci`, then `npm run package:plugin`. Upload **`dist/canvas.zip`** through **Plugins → Add New → Upload Plugin** and activate **Canvas**. The ZIP includes a production build, bundled patterns and images, authoring instructions, and the editable source. It excludes the local site, accounts, credentials, MCP Adapter, and development dependencies. Node.js is not needed on the destination site.

Packaging requires the `zip` command and checks version and requirement metadata before building into temporary staging. It leaves an existing ZIP intact if the build fails. `dist/canvas-preview.zip` and `dist/canvas-playground.zip` are browser demo bundles and cannot be installed as WordPress plugins.

For a manual installation, extract `dist/canvas.zip` and copy its `canvas/` directory into `wp-content/plugins/`. Canvas refuses activation when its compiled assets are missing. The current development site runs WordPress 7.1.1. The Update URI identifies this GitHub distribution and prevents unrelated WordPress.org plugins from replacing it; updates are installed manually.

The plugin uses the standard [WordPress readme format](https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/) in `readme.txt`.

## Source

| Path | Purpose |
| --- | --- |
| `canvas.php` | Plugin metadata and bootstrap |
| `src/` | Editor controls, interactions, shared layout math, and frontend styles |
| `includes/` | Block registration, rendering, serialization, abilities, and patterns |
| `patterns/`, `images/` | Bundled compositions and their assets |
| `build/` | Generated block assets |
| `scripts/`, `tests/` | Local development, packaging, and checks |
| `blueprint.json` | Local Playground setup |
| `AUTHORING.md` | Bundled Canvas authoring contract |
| `.playground/` | Ignored local WordPress data and caches |

Canvas uses `tabor/canvas` and stores authored child settings in `canvas`. Core content remains editable in Gutenberg. The editor and frontend share layout resolution; PHP provides the initial rendering. Content-aware responsive reflow requires the frontend script. The plugin supports the current experimental format only; the complete authoring contract lives in [AUTHORING.md](AUTHORING.md).

## Agent connections

For connected-site design and editing, use the portable [Canvas editor skill](.agents/skills/canvas-editor/SKILL.md), including pages, posts, shared parts, and whole-site layouts. It reads the connected site's current authoring contract instead of bundling a second copy. To make it available across local Codex projects, link its folder into `~/.codex/skills/canvas-editor`; other skill-capable agents can install the same folder. The skill still needs an authenticated site connection. Use the [pattern builder skill](.agents/skills/pattern-builder/SKILL.md) for reusable compositions and source-backed site builds. Its complete folder is also installable separately; repository examples are optional, and the connected site's contract remains authoritative.

Canvas supplies nine WordPress abilities: `get-context`, `get-site-structure`, `get-sections`, `validate-sections`, `create-page`, `create-post`, `create-template`, `insert-sections`, and `update-section`, all prefixed with `canvas/`. `get-context` returns the bundled authoring instructions, registered schemas, and site styles. Existing page callers retain `page_id`; document operations also accept `post_id` or an active-theme `template_id` with its `template_type`. No separate AI provider key is needed. Canvas remains usable without MCP Adapter.

### Whole-site composition

Canvas supports Site Logo, Site Title, Navigation, Post Title, Featured Image, and Post Excerpt as native children, in addition to its existing composition blocks. WordPress resolves their data and rendering context. Shared headers and footers remain native template parts; discover their identities and references with `get-site-structure`. Editing a theme-provided template creates a database customization and a recovery revision, while preserving the theme file. Scoped section writes retain surrounding blocks and reject stale fingerprints and active editor locks.

Native article bodies, Query Loops, pagination, search, comments, and shared references can be placed inside Canvas. These flow blocks retain their native context and natural content height; nested Canvas compositions allow each real query result to have an editable layout. Keep Post Template and Query No Results under Query, and pagination controls under their native pagination container. Canvas isolates nested measurements and editor gestures so the outer section does not take over its inner composition. Use the Site Editor or native template REST endpoints for structural template assembly, and Canvas abilities to compose or revise Canvas sections. Global styles continue to come from WordPress. Synced patterns and block bindings are not accepted by the Canvas section validator.

See [native flow compositions](docs/native-flow.md) for structure, limitations, the all-Canvas design demonstration, and the reproducible `npm run test:flow` browser check.

### Core block compatibility

Canvas admits ordinary native content and layout blocks, including lists, quotes, tables, galleries, audio, Columns, Cover, Media & Text, Details, Accordion, and Tabs, while retaining Core's insertion eligibility and structural parent rules. Native variations remain available. The authoring context exposes parent/ancestor, allowed-child, and context metadata so agents can compose valid native structures.

Run `npm run test:core` for the isolated WordPress core-block inventory and browser fixtures. The report in `.playground/core-blocks/report.json` lists every registered core type and distinguishes serialization, rendered smoke coverage, contextual children, and missing fixtures. Meaningful fixtures cover all 106 admitted types in the pinned installation, including real post, term, and comment contexts. Additional checks exercise local media playback, pagination, search, comments, disclosures, and saved native editing. Remote providers, assistive technology, and every block setting are not certified by these checks. The audit does not modify the demo or normal development site.

Run `npm run test:editor` for bounded actual-control checks in a separate disposable installation. Set `CANVAS_EDITOR_SUITE=image-logo`, `layout`, or `media` to run one family. Reports distinguish exercised controls from untested controls; this is not exhaustive editor certification. Image and Site Logo checks exercise Freeform mode as well as saved frontend behavior. The suite never needs access to a real site's media or settings.

Custom HTML and Classic content retain the existing strict post-HTML sanitization. Synced references, Legacy Widget references, and Shortcode blocks are not admitted by the authoring contract; More and Page Break belong between sections rather than inside Canvas. File download links are supported by the authoring tools, but PDF object previews remain outside their HTML safety boundary. See [AUTHORING.md](AUTHORING.md) for these limits. Do not describe all core blocks as fully verified merely because their default serialization passes.

The isolated whole-site benchmark creates shared Canvas headers/footers and front-page, page, single, archive, index, search, and 404 templates. It exercises dynamic content, long articles, missing featured images, and shared site data without touching `.playground/wordpress/`:

```sh
npm run build
npm run test:site
npm run test:site -- --profile editorial
npm run test:site -- --profile portfolio
npm run test:site -- --serve
node scripts/review-site.mjs .playground/site-benchmark/wordpress/canvas-site-benchmark.json
node scripts/test-site-editor.mjs
```

Profiles use separate `.playground/site-benchmark[-profile]/wordpress/` directories and pin WordPress 7.1.3 with PHP 8.3. They reuse their own saved sites; stop a profile's server before running its fixture again. CI runs all three profiles after the standard checks. After `npm run package:plugin`, `npm run test:site -- --packaged` verifies a fresh ZIP installation in a separate site without mounting plugin source. CI also runs that packaged check.

The browser tools use Chromium from Playwright (`npx playwright install chromium` when missing). The review captures frontend routes at 320, 390, 768, 1024, and 1440px, checks editor block validity, and verifies that Canvas renders in the editor iframe. The editor smoke test verifies native edit entry, keyboard movement, undo, save/reload, and saved-content restoration in a shared header, full template, page, and post. It uses the isolated service benchmark on port 9404 by default and trashes its own temporary draft fixtures. Screenshots and JSON reports stay in ignored `.playground/` directories. Intentional overlap, design quality, reading order, keyboard/touch usability, and screen-reader behavior still require review; a successful browser run does not establish accessibility or visual fidelity.

Before treating whole-site authoring as production-ready, complete these gates:

- Verify the benchmark across supported themes and browsers, including shared-part editing and save/reload.
- Review content changes, navigation overlays, font loading, and intermediate widths for layout and readability.
- Test keyboard, touch, and screen-reader workflows, including semantic reading order.
- Measure long-page layout performance and verify plugin/theme export on a fresh site.
- Define the stable saved-format compatibility policy and finish the release requirements above.

### Local development

1. Run `npm run dev`. The Blueprint installs official MCP Adapter **0.6.1** separately from Canvas.
2. In **Users → Profile**, create an Application Password for your agent. Local development enables these on loopback HTTP; use HTTPS on remote sites.
3. Connect an HTTP MCP client to `http://127.0.0.1:9403/wp-json/mcp/mcp-adapter-default-server`, using HTTP Basic authentication with your username and Application Password. Keep the password in the client's secret storage. Stdio-only clients can use `@automattic/mcp-wordpress-remote` with its authentication setup. Cloud agents cannot reach your computer's loopback address.
4. Discover Canvas through `mcp-adapter-discover-abilities`, inspect schemas with `mcp-adapter-get-ability-info`, and execute through `mcp-adapter-execute-ability`. The abilities are not individually listed by MCP `tools/list`.
5. Ask the agent to read `canvas/get-context`, compose and validate the sections, then create or update the page. Open the returned page and editor links to check editable blocks, site alignment, and mobile layout.

Example prompt:

> Read Canvas's authoring instructions and this site's styles. Create a page named “Canvas test” with sections matching this reference. Keep the content aligned with the site's wide width, check mobile, and publish it.

New pages publish by default; request a draft when needed. Updates preserve status and affect published pages immediately. Existing-page writes require the current fingerprint from `get-sections`; reread after writes or conflicts. They preserve revisions and do not update unsaved editor buffers. Save and leave the target page's editor before server-side updates, then reopen it. Do not disturb another page's unsaved editor.

### Shared browser Playground

The demo runs inside each visitor's browser. Its sharing URL is not an external WordPress REST or MCP endpoint. The automatic preview includes Canvas only; the optional saved-site bundle also includes MCP Adapter. Either can expose Canvas abilities through the official Playground bridge. Configure a local stdio MCP client:

```json
{
  "mcpServers": {
    "canvas-playground": {
      "command": "npx",
      "args": ["-y", "@wp-playground/mcp@3.1.55"]
    }
  }
}
```

The bridge is separate from the project's pinned CLI and needs a compatible local Node runtime and an open browser tab.

1. Open the ordinary demo link without MCP enabled, wait for setup, and save it in browser storage with **Keep autosave permanently**.
2. Call `playground_get_website_url` and open its exact URL in the same browser profile. Do not combine `blueprint-url` and `mcp-port`; Playground blocks Blueprint startup while MCP is active.
3. Call `playground_list_sites`, identify the saved Canvas demo, and open it with `playground_open_site_in_new_tab`. Keep the returned bridge parameters and verify the target site ID.
4. Use `playground_request` to discover `/wp-json/wp-abilities/v1/abilities?_fields=name,label,description` and inspect the Canvas schemas. The bridge supplies REST authentication. Read abilities with GET query inputs such as `?input[page_id]=123`; write with POST JSON `{"input":{...}}`.
5. Follow the same context, validation, and page-write workflow. Refresh after saved-content changes and keep the tab open during agent work.

The bridge also has broad file and PHP access to that browser sandbox; connect a trusted local agent and recheck the target when switching sites. A packaged demo does not establish compatibility with every MCP client.

### Canvas pattern builder

The [pattern builder skill](.agents/skills/pattern-builder/SKILL.md) covers reusable patterns and complete editable Canvas sites, including native queries, article flow, nested compositions, and Site Editor templates. The [named agent](.codex/agents/pattern-builder.toml) follows that same skill. Invoke `$pattern-builder` with a screenshot, URL, or design brief:

> Turn this reference into a reusable Canvas pattern. Register it, create a local preview, and check the editor and frontend on mobile, tablet, desktop, and ultrawide screens.

For a whole-site build, specify the intended Pages, Posts, and Site Editor editing surfaces, real content routes, and visual direction. For live MCP editing without source registration, invoke `$canvas-editor` with the same brief. Confirm skill discovery and native block editability after saving and reloading; registered patterns should appear in WordPress's **Canvas** category. Review actual responsive screenshots, navigation, search, pagination, and long-content behavior. Agent configuration does not supply WordPress credentials; use an MCP connection or an authenticated browser session.

In Codex, new designs start with Imagegen mockups for every screen on desktop and mobile, before layout implementation. The agent then builds the selected designs as editable Canvas blocks and compares real browser screenshots against the mockups. The skills require fixing material visual differences, not just matching colors or passing tests. They retain existing branding unless a change is requested, and report tool limitations or unresolved mismatches honestly. Small copy changes and nonvisual fixes do not trigger a full design round.

## Share the demo

### Automatic preview

[Build Playground](.github/workflows/playground.yml) runs on pushes to `trunk`, on demand, and monthly to refresh the artifact. It installs locked dependencies, runs `npm run check`, and packages the plugin with `npm run package:preview`. The build needs no local WordPress database or repository secrets; its GitHub token has read-only repository access.

The resulting `dist/canvas-preview.zip` contains a Blueprint and the compiled `canvas.zip`. The Blueprint installs Twenty Twenty-Five and Canvas, creates a homepage from [scripts/preview-content.html](scripts/preview-content.html) using the theme's **Page No Title** template, disables editor welcome guides, logs the visitor in, and opens that page in the Site Editor with **Show template** enabled. The five sections remain ordinary editable blocks. Edit that HTML file to update the demo; `{{CANVAS_PLUGIN_URL}}` resolves to the installed Canvas plugin's URL so bundled images work in every fresh Playground.

The workflow uploads the bundle's **contents** as the `canvas-playground` artifact so `blueprint.json` sits at the ZIP root. [Playground's GitHub proxy](https://github.com/WordPress/wordpress-playground/blob/trunk/packages/playground/website/public/plugin-proxy.php) serves this artifact directly to the README link. Keep the workflow name `Build Playground`, branch `trunk`, and artifact name `canvas-playground` in sync with that link. No release or manual upload is needed.

Artifacts last 90 days. Monthly builds refresh them while scheduled workflows remain enabled; GitHub can disable schedules on inactive public repositories. If the link expires, run **Actions → Build Playground → Run workflow** on `trunk`. Each fresh launch loads the current available build; a site already saved in a visitor's browser keeps its own plugin copy and edits.

### Regular patterns comparison

A second Playground uses the same Twenty Twenty-Five theme, Page No Title template, automatic login, and Site Editor preferences, with no Canvas plugin installed. Its content lives in [scripts/regular-patterns-content.html](scripts/regular-patterns-content.html). Update its six sections with serialized core WordPress blocks from the editor's Code editor. Use `{{THEME_URL}}` for bundled Twenty Twenty-Five images, or public HTTPS image URLs; Canvas plugin assets are unavailable in this demo.

Run `npm run package:patterns` to create `dist/regular-patterns-preview.zip`; this needs no plugin build or local WordPress database. The same **Build Playground** workflow publishes its contents as `regular-patterns-playground` and refreshes both demos on the same schedule.

After the updated workflow succeeds on `trunk`, share [the regular patterns Playground](https://playground.wordpress.net/?blueprint-url=https%3A%2F%2Fplayground.wordpress.net%2Fplugin-proxy.php%3Forg%3DAutomattic%26repo%3Dcanvas%26workflow%3DBuild%20Playground%26branch%3Dtrunk%26artifact%3Dregular-patterns-playground). This separate link opens an independent site; edits in either Playground do not change the other demo.

### Optional saved-site demo

To share the specific composition, template, and styles saved in your local site instead of the automatic pattern preview, use the existing snapshot packager:

Save local page **10**, the Pages template, and global styles before packaging; the command reads saved content rather than editor buffers.

```sh
npm run package:playground
npm run playground:link -- 'https://playground.wordpress.net/plugin-proxy.php?repo=Automattic/canvas&name=canvas-playground.zip'
```

Packaging writes `dist/canvas-playground.zip` with the built plugin, its readme and authoring instructions, this README, MCP Adapter, Twenty Twenty-Five 1.5, and the selected page's content and images. It requires `sqlite3`, `zip`, and network access for uncached assets. It reads the local database without modifying it and builds in temporary staging so a watcher cannot overwrite release assets.

Upload `dist/canvas-playground.zip` as an asset named **`canvas-playground.zip`** on a public [Automattic/canvas release](https://github.com/Automattic/canvas/releases) marked **Latest**. The link printed above uses Playground's GitHub download proxy to avoid GitHub's cross-origin download restriction. It follows GitHub's [latest-release download URL](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases), so retain that asset name on subsequent releases. Draft releases and prereleases do not supply the latest-release download. This optional link is separate from the automatic preview at the top of this README.

The link command prints the sharing URL; neither command uploads or publishes anything. The asset must be publicly downloadable and accessible to Playground's browser fetch. Check a fresh imported site and the actual hosted link after publishing, including images, editing, saving, and responsive layouts. Each visitor gets an independent site. Upload `canvas.zip` separately for teammates who want to install the plugin on their own WordPress site.

Coordinate public demo updates in the existing [demo release task](codex://threads/01a0b5de-c25e-7281-a195-b2fe692dcd9e) and preserve its permanent URL. Runtime data, dependencies, generated builds, distribution ZIPs, and browser artifacts stay out of Git.
