import path from 'node:path';

// Keep the installable plugin separate from repository tooling and local data.
export const pluginEntries = [
  'canvas.php', 'includes', 'patterns', 'images', 'readme.txt', 'AUTHORING.md', 'src',
];

// Retain the local plugin directory so existing Playground activation and saved
// image URLs continue working when the repository's source files move.
export const playgroundPluginPath = '/wordpress/wp-content/plugins/playground-plugin';

export function pluginMounts(root) {
  return [...pluginEntries, 'build'].map(entry =>
    `--mount=${path.join(root, entry)}:${playgroundPluginPath}/${entry}`
  );
}
