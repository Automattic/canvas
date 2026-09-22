=== Canvas ===
Contributors: richtabor
Tags: block, editor, layout, design
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.3
Stable tag: 0.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Move, resize, rotate, and layer WordPress blocks to create responsive layouts.

== Description ==

Canvas adds a block for composing responsive layouts with WordPress headings, paragraphs, images, buttons, and groups. Arrange content on a grid while keeping text and images editable with the native block editor.

* Move, resize, rotate, and layer blocks directly on the canvas.
* Start with automatic tablet and mobile layouts, then adjust each view when needed.
* Use your theme's content width, wide width, colors, typography, and spacing.
* Fit text to its area, shape and reposition images, and group related blocks.
* Start from bundled patterns in the Canvas category.
* Work with a mouse, keyboard, or touch screen.

Canvas 0.1.0 is an experimental team preview for test sites, not a stable production release. Its saved layout format can change, and it uses private and experimental WordPress editor APIs that need review when WordPress changes. The repository README tracks the remaining release work.

Canvas changes the layout of its own blocks. It also makes inserted unsynced patterns immediately editable throughout the block editor.

== Installation ==

1. Upload canvas.zip through Plugins → Add New → Upload Plugin, or copy its canvas folder into /wp-content/plugins/.
2. Activate Canvas from the Plugins screen.
3. Open a page or post in the block editor and insert a Canvas block, or choose a pattern from the Canvas category.

A source checkout needs a production build before installation. Run npm ci and npm run package:plugin from the repository root to create dist/canvas.zip. The separate canvas-playground.zip is a browser demo, not an installable plugin. Node.js is only needed for development. Install updates manually using a newly built plugin ZIP.

== Usage ==

= Arrange content =

Use Add block inside a Canvas to insert a heading, paragraph, image, or buttons. Click a block to select it, then drag to move it. Drag its edges or corners to resize; release to snap to the grid. Hold Shift + Command (Mac) or Shift + Ctrl (Windows/Linux) while dragging a resize handle to resize proportionally from the center. Command/Ctrl-drag a corner to rotate. Click selected text again, double-click, or press Enter to edit it normally. Escape returns to moving.

Select the Canvas block and toggle Show cells in its toolbar to keep the grid visible while working inside it. This editor-only guide does not change the published page.

Temporary guides show where a block will snap when you release it. Vertical edge snapping sets a position once. Center vertically keeps the row span and chooses the nearest cell position; a tie uses the earlier row. Increasing the row count or dragging the Canvas height handle adds space below without moving or resizing existing blocks. Hold Shift while resizing the Canvas to add equal space above and below. Partial padding-cell blocks keep their exact size as rows are added. Group moves preserve the spacing between children. Existing content, wide, padding, and full-width horizontal alignment continues to follow the section width.

Hold Command (Ctrl on Windows/Linux) while dragging a corner or the block's surface to rotate. Shift snaps rotation to 15-degree increments. The right-click menu provides layer order, alignment, visibility, and block-specific controls. Select several blocks and right-click the selection to access Group.

= Keyboard and touch =

Arrow keys move a selected block by one cell. Tab reaches resize and radius handles when available; arrow keys adjust the focused handle. Command/Ctrl plus arrow keys rotates, and Shift uses larger rotation steps. Shift+F10 opens the context menu. Escape cancels an active gesture.

On touch screens, tap to select, drag with one finger to move, or pinch and twist with two fingers to scale and rotate. Tap selected text again to edit it; long press opens the context menu. Swipe empty space or an unselected block to scroll.

= Images and text =

In the right-click menu, use Text sizing to choose Default, Fit area, or Fit width, and Content alignment to position text or buttons within their frames. Native typography, image replacement, alt text, links, and captions remain available.

Choose an image shape in Styles → Shape or the context menu. Hover or focus previews a shape; selecting it applies the change. Shapes can have preferred proportions and resize locks. Image → Stretch shape overrides that behavior for an individual image while preserving its frame and crop. Image → Lock aspect ratio controls proportional resizing. Double-click a filled image to reposition its crop, then click outside or press Escape to finish.

= Groups and spacing =

Select sibling blocks and choose Group in the context menu to move them together. Click again to edit a child; Escape moves back through the group. Ungroup retains the children's layout. Use native background, border, radius, padding, and spacing controls to style the composition.

Gap in Canvas Settings currently adjusts space inside fixed grid areas. Increasing Gap makes blocks smaller within their areas while keeping the grid and section height stable. Blocks inset equally from their top and bottom edges; horizontal boundary alignment is preserved. Text can still require more height to remain readable.

= Responsive layouts =

Use WordPress's Desktop, Tablet, and Mobile previews. Automatic layouts preserve desktop proportions, image sizes, and spacing. Smaller views inherit the section's row count, including empty space, while row heights and cell gaps scale together. The simpler tablet and mobile grids are for editing; automatic block edges can fall between those larger cells. Readable text and buttons can grow when their content needs more room, and paragraphs do not automatically become full width. Moving, resizing, or aligning an individual block resolves its frame to that view’s grid and creates an override; content and typography stay shared. Use Reset responsive layouts in the Canvas Settings panel to restore automatic placement.

Review reading order, text fit, images, and overlaps at several widths before publishing. List View controls the content's reading order. Nested Canvases and arbitrary third-party blocks are outside the supported scope.

== Frequently Asked Questions ==

= Do I need a particular theme? =

Canvas uses the active theme's layout and style settings. Available widths and styles depend on the theme and the surrounding template.

= What happens if I deactivate Canvas? =

The headings, paragraphs, images, buttons, and groups remain saved as core WordPress blocks. Canvas positioning and responsive behavior require the plugin to be active.

= Can an agent create or edit Canvas sections? =

Yes. Canvas exposes WordPress abilities for reading context, validating sections, and creating or updating pages. An MCP client also needs the separate WordPress MCP Adapter or a local Playground bridge. The bundled AUTHORING.md describes the format and authoring workflow; the repository README covers connections. No AI provider account is required to use Canvas itself.

== Changelog ==

= 0.1.0 =

* Initial development version with direct block manipulation, responsive layouts, image shapes, groups, bundled patterns, and WordPress authoring abilities.
