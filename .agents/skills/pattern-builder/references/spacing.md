# Spacing That Explains The Page

Read this before expanding a selected concept into every screen and again during the mockup/browser review. Spacing is part of the composition, not a final polish step. A token scale alone cannot make a page well spaced.

## Define Relationships Before Numbers

Write a compact spacing contract for the selected theme: outer page insets, wide content bounds, article measure, gaps within a title/date/excerpt group, separation between entries, and major transitions such as header-to-main and article-to-comments/footer. Map each role to native settings. Keep related items closer than separate groups; do not apply one large block gap indiscriminately.

Choose a small reusable scale suited to the actual font and density. An example set is 8, 12, 16, 24, 32, 48, and 64px, expressed as native spacing presets where appropriate. This is a starting vocabulary, not a required grid, universal theme recipe, or accessibility threshold. Make optical adjustments when the real type needs them. Consistency means repeating the same relationship, not making every gap equal.

## Align The Visible Content

Choose one authoritative desktop and phone header/footer target and reuse it across screen generation. A route may change its reading measure or intentionally use a compact header, but record that departure in the spacing contract; independent image generations must not silently redefine shared chrome.

Establish shared page-edge guides for header, main, and footer at each layout size. A deliberately narrower centered article can sit inside those bounds, but it must not gain another arbitrary nested inset on phones. Verify the visible artwork edge, branding, text and controls, not just container rectangles. Avoid accumulating root padding, Canvas padding, Group padding, and child margins to produce an unintended double gutter.

Preserve purposeful asymmetry. Use stable column tracks for repeated entries; a portrait image, missing photo, or longer headline must not silently change where the next column starts. Distinguish intentional white space from a tall empty strip caused by fixed rows or an unbalanced sidebar. Never fix that strip by cropping content or manufacturing decorative filler.

## Pace Reading And Interaction

- Keep title, metadata, excerpt, and its read link visibly connected. Give the next entry a stronger boundary than gaps inside the current one.
- Give interior article headings more space before than after so they belong to the following prose. Judge paragraph separation together with body size, leading, and line length; avoid both a solid wall of text and isolated floating paragraphs.
- Keep image captions close to their images, labels close to fields, and helper text attached to its control. Touch-target size is a control requirement, not a reason to add huge gaps between all elements.
- Give comments, pagination, and the footer deliberate transitions. Avoid a footer glued to the final link or stranded far below short content.
- Recompose phone spacing rather than scaling a desktop screenshot. Inspect readable type and useful line length at the claimed viewport, with comfortable common insets.

## Use One Spacing Owner Per Relationship

Use theme.json for shared spacing presets and defaults, native Row/Stack/Grid/Group blockGap for siblings, padding for a container's inset, and targeted native margins only for an intentional exception. Inspect the installed schemas and computed result: normal-flow blockGap can render as sibling margins, while flex/grid uses gap. A child margin added on top may double the visible separation. Do not compensate with negative margins before finding the actual owner. Canvas cell gap is geometry, not a substitute for paragraph rhythm.

## Prove It Before Spending On Every Screen

After selection, inspect a representative home and long-prose phone/desktop proof with the actual font. Resolve the shared spacing contract before generating the entire screen family. Prompts must specify the alignment, grouping, major separations, and sensible phone line length, not just 'generous whitespace.' Treat an Imagegen phone image with desktop-like gutters, tiny normalized text, or duplicate navigation as a failed target. For long phone pages, use ordered readable continuation images instead of squeezing a desktop layout into one tall miniature.

In one batched browser review at narrow, intermediate, and wide widths, record visible left/right insets, reading width, header-to-main distance, and representative title/date/body, paragraph, heading, and footer gaps. Compare those relationships with the selected target, not just whether overflow is absent. Check long copy, actual missing media, zoom and text-spacing overrides on a safe fixture. Native editor and saved frontend must agree. Batch material fixes, then confirm affected views once; report unresolved spacing rather than treating token use as approval.

## Sources And Scope

Measure actual visible distances between adjacent boxes as well as computed styles; margins can collapse and native gap rules can change the result. Label CSS zoom, narrower viewports, or emulation as simulations rather than evidence of actual browser zoom. These measurements support visual judgment; they are not an aesthetic pass by themselves.

- [USWDS typography](https://designsystem.digital.gov/components/typography/): whitespace communicates relationships; interior headings connect to the following text; paragraph spacing works with reading measure and leading. These are editorial starting principles, not mandatory government styling.
- [USWDS spacing units](https://designsystem.digital.gov/design-tokens/spacing-units/): a limited token vocabulary supports reuse. Its eight-pixel system is an example, not a universal requirement.
- [WordPress spacing settings](https://developer.wordpress.org/themes/global-settings-and-styles/settings/spacing/) and [spacing in block themes](https://developer.wordpress.org/news/2023/03/everything-you-need-to-know-about-spacing-in-block-themes/): native presets, padding, margins and blockGap; verify actual installed support.

This method was added after the user reported poor spacing in Side Street mockups. Specific Side Street dimensions stay in that theme's design record; other themes must establish their own appropriate rhythm.
