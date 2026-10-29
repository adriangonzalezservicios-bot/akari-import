async function loadChunk(i) {
  const b64 = (await fetch(new URL(`admin.p${i}.b64`, import.meta.url)).then(r => r.text())).trim();
  return b64;
}
const parts = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(loadChunk));
const b64 = parts.join('');
const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const ds = new DecompressionStream('gzip');
const stream = new Response(bin).body.pipeThrough(ds);
const code = await new Response(stream).text();
const blob = new Blob([code], { type: 'text/javascript' });
await import(URL.createObjectURL(blob));
