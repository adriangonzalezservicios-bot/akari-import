export async function onRequest(context) {
  const { request, env } = context;
  const endpoint = env.GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) return Response.json({ ok:false, error:'Falta configurar GOOGLE_APPS_SCRIPT_URL en Cloudflare Pages.' }, { status:500 });
  const url = new URL(request.url);
  const target = endpoint + (url.search ? url.search : '');
  try {
    const body = request.method === 'GET' ? undefined : await request.text();
    const upstream = await fetch(target, { method: request.method, headers: { 'Content-Type':'application/json' }, body, redirect:'follow' });
    const text = await upstream.text();
    return new Response(text, { status:200, headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' } });
  } catch (e) { return Response.json({ ok:false, error:'No se pudo conectar con el backend de Google Sheets.' }, { status:502 }); }
}
