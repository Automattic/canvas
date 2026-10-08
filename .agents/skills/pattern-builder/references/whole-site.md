# Whole-Site Canvas Composition

Use this reference for complete sites, Site Editor work, native loops, nested compositions, and article layouts. The current authoring contract and runtime block schemas remain authoritative: read [AUTHORING.md](../../../../AUTHORING.md) in a plugin checkout, or the guide returned by the connected site's context tool in a standalone skill installation.

## Destination And Ownership

Read site styles and schemas with `canvas/get-context`; discover effective templates and shared references with `canvas/get-site-structure`. Inspect saved content with `canvas/get-sections`, using exactly one destination selector. Verify theme-scoped template identities, publication state, available assets, and the user's requested editing surface before writing.

Decide where owners will edit each piece. Shared header/footer content belongs in template parts. Repeated article and archive layout belongs in templates. A homepage that must be editable through Pages needs its actual Canvas compositions in the Home page's saved content, with a front-page template rendering native Post Content. Do not place all visible homepage content only in a template and claim that the page editor can change it. A template-first homepage is appropriate when the user explicitly wants that editing model.

Source pattern changes do not refresh previously inserted unsynced blocks or database-customized templates. Inspect the effective document, preserve unrelated edits, and update the authorized copy deliberately. Clear only the relevant runtime pattern cache when a verified source change remains stale; do not reset the site or remove template customizations to hide that distinction.

## Native Content Inside Canvas

Canvas owns placement; WordPress owns content, context, forms, and repetition. Use native dynamic title, featured image, metadata, Site Title, Navigation, Post Content, Query Loop, search, and comments where the destination needs them. Never replace a real loop with static cards or render one post's title as the shared article template's heading.

Useful structures:

- Canvas contains Query; Query contains native Post Template; Post Template repeats a Canvas composition for each real result.
- A Canvas card layers its native featured image, terms, title, excerpt, and date, preserving each post's links and context.
- Inside Query ancestry, Canvas can contain native Query Pagination with its native controls kept directly inside Query Pagination.
- Comments retains its required native Comment Template and pagination parents; Canvas can compose content within permitted descendant positions.
- An article or page Canvas contains natural-height Post Content, which may itself contain saved Canvas sections when the user wants Canvas authoring in the post/page editor.
- Shared template-part references render real shared content rather than copied header/footer markup.

Honor both the registered `parent` and `ancestor` declarations. Context schemas may contain attributes and supports without those declarations: use the installed guide's known structures and validation, and inspect the native block-type endpoint or editor registry when available for missing constraints. Absence from context does not imply unrestricted nesting. Query ancestry does not waive a pagination control's required immediate parent. Keep structural blocks and their allowed children native, without artificial Canvas placement on descendants that are not direct Canvas children.

Native flow blocks grow from their real content. Use modest starting row spans and appropriate horizontal bounds; do not assign a large fixed height to make a query or article fit one screenshot. Place later items with a clear initial relationship, then verify growth and collision clearance. Test empty and populated queries, long articles, long translated headings, and more than one row of results. Each nested Canvas keeps its own grid, responsive placements, stacking order, and gestures; an outer placement positions the composition, not its individual inner items.

When the user requests all visible areas in Canvas, put visible section content in Canvas while retaining native structural parents and semantic landmarks. A native loop or Post Content child inside Canvas satisfies the layout boundary without flattening its contents or breaking context.

For elements that should share ordinary alignment, use a native Row or Stack inside Canvas rather than independent frames. A header's brand, navigation, and search can share one vertically centered Row; a heading and its deck can use a Stack with a native gap. Canvas places the composition, while WordPress handles its internal flow. Keep shared padding on the Row or Stack when that makes its content bounds predictable. Retain independent Canvas frames where the design actually needs layering or separate placement.

## Design A Site, Not A Collection Of Demos

Establish a subject-specific layout grammar: masthead weight, imagery, headline hierarchy, reading measure, card anatomy, recurring labels, section rhythm, and footer treatment. Reuse that grammar across routes with variations suited to their jobs. A single post needs a readable body; an archive needs scanning and pagination; a search route needs genuine result and empty states. Strong Canvas art direction can combine deliberate overlapping image/title frames with calm natural-flow reading areas.

Keep the skill's Global Styles inheritance defaults. If the user requests a new theme or brand system, put shared design choices in that theme's native `theme.json` and Global Styles, then let Canvas inherit them. Explicit user art direction can authorize particular fonts, colors, and imagery; one reference image alone does not authorize replacing an existing site's identity.

A reusable theme must retain its identity when an editor supplies unrelated photos, mixed aspect ratios, or no featured image. Apply the [theme-owned identity and content-swap gate](design-mockups.md#make-personality-belong-to-the-theme). Judge the composition with real missing-content states, not only the curated demo. Keep demo-media import separate from theme activation; include required theme-owned design assets in the package and document their role.

Use supplied or authorized media for a requested finished image-led site. Isolated image-area patterns still use native placeholders by default unless actual imagery is requested. Confirm final assets render at their intended crop and remain replaceable. A route comp helps establish proportion and layering; build its structure as editable blocks, not a screenshot masquerading as the page.

## Verify The Whole Result

Select route coverage that matches the site: homepage, journal/index, relevant archives, search with and without results, several articles, standard/utility pages, and 404. Check real URLs, result counts, featured images, inherited filtering, pagination, native search, navigation overlays, and article content. Do not count HTTP 200 or successful markup validation as proof of a working route.

Inspect both the saved frontend and the intended editing surfaces on desktop and mobile. Confirm that normal owners can select, edit, replace media, move Canvas items, use native controls, and save/reopen without invalid blocks. Test nested item movement and multi-selection independently of outer-grid movement. Long-content checks must confirm stable height and a visible following section or footer, not merely the presence of text somewhere in the DOM.

Check shared chrome against its visible bounds: the logo, links, and controls should share the intended center or baseline, with balanced space above and below. Equal saved row numbers do not prove visual alignment. Inspect intermediate widths and actual click targets, including search after expansion and a menu after its opening transition. Fix the native composition before compensating with negative margins or CSS that overrides Canvas positioning.

Compare useful full-resolution screenshots to the brief or comp. Fix the largest proportion, readability, cropping, overlap, and responsive issues first. Retain intentionally layered compositions while making controls and reading content reliable. Finish with the verified links and editing surfaces, actual checks, and any remaining limitation; do not describe source-only work as a fully verified site.
