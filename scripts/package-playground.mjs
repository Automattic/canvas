import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterArchive } from './mcp-dependency.mjs';
import { buildPlugin } from './build-plugin.mjs';
import { validateBlueprint } from '@wp-playground/blueprints';

const root = fileURLToPath(new URL('../', import.meta.url));
const wordpress = path.join(root, '.playground/wordpress');
const dist = path.join(root, 'dist');
const sourcePageId = 10;
const theme = 'twentytwentyfive';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout || result.status}`);
  return result.stdout;
}
function sql(query) {
  return JSON.parse(run('sqlite3', ['-readonly', '-json', path.join(wordpress, 'wp-content/database/.ht.sqlite'), query]) || '[]');
}
function option(name) {
  return sql(`SELECT option_value FROM wp_options WHERE option_name='${name}'`)[0]?.option_value;
}

// Read only selected public content. Never mount or export the source database.
const page = sql(`SELECT ID,post_title,post_name,post_content FROM wp_posts WHERE post_type='page' AND ID=${sourcePageId} AND post_status='publish'`)[0];
if (!page) throw new Error(`Published page ${sourcePageId} was not found. Save and publish it before packaging.`);
if (!page.post_content.includes('<!-- wp:tabor/canvas') || /wp:(?:playground|tabor)\/fluid-section/.test(page.post_content)) throw new Error('The demo source must use current Canvas blocks. Legacy Fluid Section content is not migrated during packaging.');
const slug = page.post_name;
if (option('stylesheet') !== theme) throw new Error('This package expects the Twenty Twenty-Five theme.');
const themePath = path.join(wordpress, 'wp-content/themes', theme);
if (!/^Version: 1\.5\s*$/m.test(readFileSync(path.join(themePath, 'style.css'), 'utf8'))) throw new Error('This package expects Twenty Twenty-Five 1.5.');
const wpVersion = readFileSync(path.join(wordpress, 'wp-includes/version.php'), 'utf8').match(/\$wp_version\s*=\s*'([^']+)'/)[1];
const template = sql("SELECT post_content FROM wp_posts WHERE post_type='wp_template' AND post_name='page' AND post_status='publish'")[0]?.post_content;
const styles = sql("SELECT post_content FROM wp_posts WHERE post_type='wp_global_styles' AND post_name='wp-global-styles-twentytwentyfive' AND post_status='publish'")[0]?.post_content;
if (!template || !styles) throw new Error('The saved Pages template and global styles are required.');
const navigation = sql("SELECT post_content FROM wp_posts WHERE post_type='wp_navigation' AND post_status='publish' ORDER BY ID LIMIT 1")[0]?.post_content;
const sourceOrigin = new URL(option('siteurl')).origin;

mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(path.join(dist, '.package-'));
const bundle = path.join(staging, 'bundle');
mkdirSync(path.join(bundle, 'media'), { recursive: true });
try {
  // Build into staging so a development watcher cannot overwrite release assets.
  const pluginPath = path.join(staging, 'plugin/canvas');
  buildPlugin(pluginPath);
  run('zip', ['-qr', path.join(bundle, 'plugin.zip'), 'canvas'], { cwd: path.join(staging, 'plugin') });
  run('zip', ['-qr', path.join(bundle, 'theme.zip'), theme, '-x', '*/.DS_Store'], { cwd: path.dirname(themePath) });

  const snapshot = { page, template, styles: JSON.parse(styles), navigation, siteTitle: option('blogname'), siteDescription: option('blogdescription'), media: [] };
  // The saved composition uses image blocks. Reject unsupported remote resources
  // below instead of silently releasing a demo that depends on the local site.
  const text = page.post_content + template + styles;
  const imageTags = [...text.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
  const urls = [...new Set(imageTags.map(match => match[1]))];
  for (const [index, url] of urls.entries()) {
    const parsed = new URL(url);
    const extension = path.extname(parsed.pathname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) throw new Error(`Unsupported image: ${url}`);
    const name = `image-${index + 1}${extension}`;
    const token = `https://canvas.invalid/media/${name}`;
    const local = parsed.origin === sourceOrigin;
    let oldId = null;
    let title = `Canvas image ${index + 1}`;
    let alt = '';
    if (local) {
      const assetLocation = [
        { prefix: '/wp-content/uploads/', directory: path.join(wordpress, 'wp-content/uploads'), isUpload: true },
        { prefix: '/wp-content/plugins/playground-plugin/images/', directory: path.join(root, 'images'), isUpload: false },
      ].find(location => parsed.pathname.startsWith(location.prefix));
      if (!assetLocation) throw new Error(`Unsupported local asset: ${url}`);
      const { prefix, directory, isUpload } = assetLocation;
      const relative = decodeURIComponent(parsed.pathname.slice(prefix.length));
      const source = path.resolve(directory, relative);
      if (!source.startsWith(`${directory}${path.sep}`) || !existsSync(source)) throw new Error(`Missing or invalid image: ${url}`);
      cpSync(source, path.join(bundle, 'media', name));
      const escaped = relative.replaceAll("'", "''");
      // A saved image may use a generated size rather than _wp_attached_file.
      // Its wp-image class still identifies the original media-library record.
      const savedId = imageTags.find(match => match[1] === url)?.[0].match(/\bwp-image-(\d+)\b/)?.[1];
      const attachment = !isUpload ? null : savedId
        ? sql(`SELECT ID,post_title FROM wp_posts WHERE ID=${Number(savedId)} AND post_type='attachment'`)[0]
        : sql(`SELECT p.ID,p.post_title FROM wp_posts p JOIN wp_postmeta m ON p.ID=m.post_id WHERE m.meta_key='_wp_attached_file' AND m.meta_value='${escaped}'`)[0];
      if (attachment) {
        oldId = attachment.ID;
        title = attachment.post_title;
        alt = sql(`SELECT meta_value FROM wp_postmeta WHERE post_id=${oldId} AND meta_key='_wp_attachment_image_alt'`)[0]?.meta_value || '';
      }
    } else {
      if (parsed.protocol !== 'https:') throw new Error(`Use HTTPS for remote media: ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Could not download image: ${url} (${response.status})`);
      writeFileSync(path.join(bundle, 'media', name), Buffer.from(await response.arrayBuffer()));
    }
    snapshot.media.push({ name, token, oldId, title, alt });
    snapshot.page.post_content = snapshot.page.post_content.replaceAll(url, token);
    snapshot.template = snapshot.template.replaceAll(url, token);
    snapshot.styles = JSON.parse(JSON.stringify(snapshot.styles).replaceAll(url, token));
  }
  // Preserve navigation labels without exporting unrelated pages. Their links are
  // inert in this demo; the one exported page links to the new homepage.
  if (snapshot.navigation) {
    snapshot.navigation = snapshot.navigation.replaceAll(`${sourceOrigin}/${slug}/`, 'https://canvas.invalid/home/');
    snapshot.navigation = snapshot.navigation.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?[^"\s<]*/g, '#');
  }
  const serialized = JSON.stringify(snapshot, null, 2);
  if (/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/.test(serialized)) throw new Error('Unmapped localhost URL in the snapshot. Add its resource before packaging.');
  writeFileSync(path.join(bundle, 'snapshot.json'), serialized);
  cpSync(path.join(root, 'scripts/setup-shared-playground.php'), path.join(bundle, 'setup.php'));
  cpSync(path.join(root, 'README.md'), path.join(bundle, 'README.md'));
  cpSync(await adapterArchive(new URL('../', import.meta.url)), path.join(bundle, 'mcp-adapter.zip'));
  const bundled = name => ({ resource: 'bundled', path: `/${name}` });
  const blueprint = {
    $schema: 'https://playground.wordpress.net/blueprint-schema.json',
    meta: { title: 'Canvas', author: 'richtabor', description: 'Explore Canvas in the WordPress Site Editor.' },
    preferredVersions: { php: '8.3', wp: wpVersion },
    landingPage: '/wp-admin/canvas-demo.php',
    login: true,
    steps: [
      { step: 'installTheme', themeData: bundled('theme.zip'), options: { activate: true } },
      { step: 'installPlugin', pluginData: bundled('mcp-adapter.zip'), options: { activate: true } },
      { step: 'installPlugin', pluginData: bundled('plugin.zip'), options: { activate: true } },
      { step: 'mkdir', path: '/tmp/canvas-demo' },
      ...['snapshot.json', 'setup.php', ...snapshot.media.map(item => `media/${item.name}`)].map(name => ({ step: 'writeFile', path: `/tmp/canvas-demo/${path.basename(name)}`, data: bundled(name) })),
      { step: 'runPHP', code: "<?php require '/tmp/canvas-demo/setup.php';" },
    ],
  };
  const validation = validateBlueprint(blueprint);
  if (!validation.valid) throw new Error(JSON.stringify(validation.errors));
  writeFileSync(path.join(bundle, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
  const zip = path.join(staging, 'canvas-playground.zip');
  run('zip', ['-qr', zip, '.'], { cwd: bundle });
  renameSync(zip, path.join(dist, 'canvas-playground.zip'));
  console.log(`Packaged ${page.post_title || `untitled page ${page.ID}`}, ${snapshot.media.length} images, WordPress ${wpVersion}, Twenty Twenty-Five 1.5.`);
  console.log(path.join(dist, 'canvas-playground.zip'));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
