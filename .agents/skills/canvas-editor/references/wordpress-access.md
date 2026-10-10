# WordPress access and editing surfaces

## Establish the actual connection

Inspect the current session's tool catalog before naming or calling tools. Report separately whether a connection is configured, responds to a transport probe, and is loaded as callable tools. Editing a configuration file does not refresh a running agent's catalog. A new session or client connection reload may be needed; do not restart an active client without the user's instruction.

Identify the destination using the connection's site information or returned canonical content URLs before mutations. A WordPress.com connector, a separate WordPress MCP Adapter, and a local Canvas bridge may point at different sites. Their names alone do not establish a shared destination.

For an Adapter discovery server, discover abilities and read each relevant ability's input/output schema before execution. For a scoped server, use MCP `initialize`, `notifications/initialized`, and `tools/list`; inspect the returned tool schemas. Do not assume generic discovery wrappers are exposed. Use a supplied, authorized local STDIO bridge directly when necessary, making clear that this is a subprocess fallback rather than a loaded app connector. Keep protocol stdout free of diagnostics and close the process after the request.

Use read-only discovery, context, and structure calls to check a connection. Inspect smoke scripts before running them: some create, update, and delete fixtures. A read-only audit does not require those mutations. Never print credentials from configuration or copy them into skills.

## Match the operation to its surface

| Owner-facing surface | Saved object | Access needed beyond Canvas sections |
| --- | --- | --- |
| Pages | Page content, title, status, assigned template | Native page read/update for ordinary surrounding blocks and metadata |
| Posts | Post content and editorial metadata | Native post read/update for categories, tags, excerpt, featured image, and status |
| Site Editor templates | Effective `wp_template` | Native template read/update for semantic structure outside Canvas |
| Site Editor shared parts | Effective `wp_template_part` | Native part read/update; changes affect every referencing template |
| Navigation | Native navigation blocks and referenced navigation content | Navigation-capable API or authenticated editor |
| Media Library | Attachment records and files | Authenticated media search/read; upload and metadata update when requested |
| Global Styles | Theme defaults plus saved user styles | Style-capable API or Site Editor for effective user customizations |

The scoped Canvas contract currently has nine abilities: `get-context`, `get-site-structure`, `get-sections`, `validate-sections`, `create-page`, `create-post`, `create-template`, `insert-sections`, and `update-section`, under `canvas/`. Inspect the installed schemas rather than assuming this list is universal. Its context can supply REST URLs without supplying a tool or credential that can call those URLs. It does not provide arbitrary REST requests, media uploads, whole-document replacement, or general Global Styles writes.

For a Pages-editable homepage, store the composition in the assigned Home page and render native Post Content in the front-page template. Identify the reading settings and assigned page before editing. Keep article content in Posts; templates supply repeated article and archive structure. Read effective template sources because saved Site Editor customizations can override files in the theme.

## Read the installed WordPress contract

Use Canvas context for its guide, supported block attributes, effective settings/styles, fingerprints, and document structure. When native structure matters, inspect available WordPress REST schemas or the editor's block registry for parent/ancestor constraints and supported attributes. Preserve native Query/Post Template, Post Content, search, comments, navigation, and dynamic post blocks.

Read effective Global Styles and preset slugs before authoring. A theme's `theme.json` supplies defaults; it is not proof of the live merged styles after user customization. Editing a theme file belongs to an authorized theme-development task. Site editing should use the site's available styles surface and respect the user's branding scope.

Read attachment IDs, source URLs, dimensions, and alt text from the destination's media records. Reuse suitable existing assets. Upload only through an authenticated media-capable surface when the task calls for it; a remote image URL or Canvas context URL does not prove upload access.

## Capabilities and recovery

Check permissions for the requested object and operation, not just successful server login. The current Canvas implementation checks `edit_post` on an existing page/post, the post type's create/publish capabilities for creation, and `edit_theme_options` for templates and shared parts. Draft creation and publishing can have different permissions. Media operations and settings have their own checks on the native surface.

Use fresh fingerprints for Canvas updates and read back after writes or ambiguous responses. Native updates require equivalent rereads and protection for unsaved editor work. Do not widen a scoped server, grant roles, install plugins, or change global configuration merely to bypass a missing capability. Use an already authorized native API, authenticated editor, or local development tooling when available; otherwise finish independent supported work and identify the precise missing connection or permission.
