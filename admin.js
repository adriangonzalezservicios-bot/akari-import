// Cargador: une las partes del panel admin
const [a, b] = await Promise.all([
  fetch(new URL('admin.part1.txt', import.meta.url)).then(r => r.text()),
  fetch(new URL('admin.part2.txt', import.meta.url)).then(r => r.text())
]);
const blob = new Blob([a + b], { type: 'text/javascript' });
const url = URL.createObjectURL(blob);
await import(url);
