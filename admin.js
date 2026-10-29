async function loadHalf(name) {
  const t = (await fetch(new URL(name, import.meta.url)).then(r => {
    if (!r.ok) throw new Error('No se pudo cargar ' + name);
    return r.text();
  })).trim();
  return t;
}
try {
  const [a, b] = await Promise.all([loadHalf('admin.a.b64'), loadHalf('admin.b.b64')]);
  const bin = Uint8Array.from(atob(a + b), c => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const stream = new Response(bin).body.pipeThrough(ds);
  const code = await new Response(stream).text();
  const blob = new Blob([code], { type: 'text/javascript' });
  await import(URL.createObjectURL(blob));
} catch (err) {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="margin:20px;padding:16px;background:#fde8e6;border:1px solid #f3c3be;border-radius:10px;font:14px system-ui">Error cargando el panel: ' +
    (err && err.message ? err.message : err) +
    '. Recargá la página o contactá soporte.</div>');
}
