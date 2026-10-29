// Worker AKARI IMPORT
// /api → Google Apps Script (con caché de catálogo público en el edge)
// resto → estáticos

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbytHLZ3bvYtaeX-RKgQvmx1PZHFse0z08XsggKByD651SrHKRc0uiUGMulyJOuxgs5e/exec';

const CATALOG_CACHE_TTL = 180; // segundos (3 min) — catálogo público

async function handleApi(request, env, ctx) {
  const endpoint = env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (!endpoint) {
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

  let bodyText = null;
  let action = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    bodyText = await request.text();
    try {
      const parsed = JSON.parse(bodyText || '{}');
      action = parsed.action || null;
    } catch (_) {}
  }

  // Caché solo para catálogo público (action catalog, sin token útil)
  const canCache = action === 'catalog' && (!bodyText || !/"token"\s*:\s*"\s*[^"]+"/.test(bodyText));

  if (canCache) {
    const cache = caches.default;
    const cacheKey = new Request('https://akari-import.cache/catalog-public-v1', { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const out = new Response(hit.body, hit);
      out.headers.set('X-Akari-Cache', 'HIT');
      out.headers.set('Content-Type', 'application/json; charset=utf-8');
      return out;
    }
  }

  const url = new URL(request.url);
  const target = endpoint + (url.search ? url.search : '');

  try {
    const upstream = await fetch(target, {
      method: request.method === 'HEAD' ? 'GET' : request.method,
      headers: { 'Content-Type': 'application/json' },
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : bodyText,
      redirect: 'follow'
    });
    const text = await upstream.text();
    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El backend de Google Sheets devolvió una respuesta vacía (estado ' + upstream.status + ').' }),
        { status: 200, headers }
      );
    }

    const responseHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': canCache ? 'public, max-age=60' : 'no-store',
      'X-Akari-Cache': 'MISS'
    };
    const response = new Response(text, { status: 200, headers: responseHeaders });

    if (canCache) {
      const cache = caches.default;
      const cacheKey = new Request('https://akari-import.cache/catalog-public-v1', { method: 'GET' });
      const toStore = new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=' + CATALOG_CACHE_TTL
        }
      });
      if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, toStore));
      else await cache.put(cacheKey, toStore);
    }

    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No se pudo conectar con el backend de Google Sheets.' }),
      { status: 200, headers }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApi(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};
