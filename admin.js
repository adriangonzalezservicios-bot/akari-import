async function loadPart(name) {
  const b64 = (await fetch(new URL(name, import.meta.url)).then(r => r.text())).trim();
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const stream = new Response(bin).body.pipeThrough(ds);
  return await new Response(stream).text();
}
const [a, b] = await Promise.all([loadPart('admin.part1.gz.b64'), loadPart('admin.part2.gz.b64')]);
const blob = new Blob([a + b], { type: 'text/javascript' });
await import(URL.createObjectURL(blob));
