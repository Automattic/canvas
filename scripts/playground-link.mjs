const input = process.argv[2];
if (!input) throw new Error('Usage: npm run playground:link -- https://richtabor.com/path/to/canvas-playground.zip');
const url = new URL(input);
if (url.protocol !== 'https:') throw new Error('Use the public HTTPS download URL for the ZIP.');
console.log(`https://playground.wordpress.net/?blueprint-url=${encodeURIComponent(url.href)}`);
