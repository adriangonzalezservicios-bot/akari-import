// Worker de AKARI IMPORT.
// - /api y /api/* se reenvían al Google Apps Script (variable GOOGLE_APPS_SCRIPT_URL).
// - Todo lo demás lo sirven los archivos estáticos del sitio (binding ASSETS).

// URL pública del Apps Script (termina en /exec). No es un secreto: las acciones privadas
// exigen token de Firebase y rol autorizado. Si en Cloudflare se carga la variable
// GOOGLE_APPS_SCRIPT_URL, esa tiene prioridad sobre este valor de respaldo.
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbytHLZ3bvYtaeX-RKgQvmx1PZHFse0z08XsggKByD651SrHKRc0uiUGMulyJOuxgs5e/exec';

async function handleApi(request, env) {
  const endpoint = env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (!endpoint) {
    // Solo nombres (nunca valores) para detectar errores de tipeo en el nombre de la variable.
    const nombres = Object.keys(env).filter(k => k !== 'ASSETS');
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Falta configurar GOOGLE_APPS_SCRIPT_URL en Cloudflare (Settings → Variables and Secrets).',
        variablesDetectadas: nombres
      }),
      { status: 200, headers }
    );
  }

  const url = new URL(request.url);
  const target = endpoint + (url.search ? url.search : '');

  try {
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
    const upstream = await fetch(target, {
      method: request.method === 'HEAD' ? 'GET' : request.method,
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'follow'
    });
    const text = await upstream.text();
    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El backend de Google Sheets devolvió una respuesta vacía (estado ' + upstream.status + ').' }),
        { status: 200, headers }
      );
    }
    return new Response(text, { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No se pudo conectar con el backend de Google Sheets.' }),
      { status: 200, headers }
    );
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
