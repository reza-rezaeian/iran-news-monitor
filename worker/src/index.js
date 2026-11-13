/**
 * Iran News Monitor — Cloudflare Worker
 *
 * - فایل‌های استاتیک از پوشه public سرو می‌شوند (Assets).
 * - /api/news و /api/prices داده‌ای را می‌خوانند که GitHub Actions
 *   هر ۳۰ دقیقه در برنچ data همین ریپازیتوری می‌نویسد.
 * - سه لایه کش: حافظه ایزوله، Cache API لبه، و origin (GitHub raw).
 *   اگر origin در دسترس نباشد، آخرین نسخه از کش برگردانده می‌شود.
 */

const TTL = { news: 300, prices: 120 };
const MEM_TTL = { news: 60, prices: 30 };

const mem = new Map(); // key -> { body, exp }

function jsonResponse(body, status, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=600",
      ...extra,
    },
  });
}

async function readData(env, ctx, key) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && now < hit.exp) {
    return { body: hit.body, source: "memory" };
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://iran-news.internal/${key}`);
  const edge = await cache.match(cacheKey);
  if (edge) {
    const body = await edge.text();
    mem.set(key, { body, exp: now + MEM_TTL[key] * 1000 });
    return { body, source: "edge" };
  }

  try {
    const res = await fetch(`${env.DATA_BASE}/${key}.json`, {
      headers: { "user-agent": "iran-news-monitor-worker" },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const body = await res.text();
    if (!body || body[0] !== "{" && body[0] !== "[") {
      throw new Error("unexpected payload");
    }

    mem.set(key, { body, exp: now + MEM_TTL[key] * 1000 });
    const toCache = new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${TTL[key]}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return { body, source: "origin" };
  } catch (err) {
    if (hit) return { body: hit.body, source: "stale" };
    const staleEdge = await cache.match(cacheKey, { ignoreMethod: true });
    if (staleEdge) {
      return { body: await staleEdge.text(), source: "stale-edge" };
    }
    return {
      body: JSON.stringify({
        error: "data_unavailable",
        message: String(err),
      }),
      source: "error",
      status: 503,
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/news" || url.pathname === "/api/prices") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return jsonResponse(
          JSON.stringify({ error: "method_not_allowed" }),
          405,
          { allow: "GET, HEAD" },
        );
      }

      const key = url.pathname === "/api/news" ? "news" : "prices";
      const { body, source, status } = await readData(env, ctx, key);

      return jsonResponse(body, status || 200, { "x-data-source": source });
    }

    if (url.pathname === "/api/health") {
      return jsonResponse(
        JSON.stringify({ ok: true, time: new Date().toISOString() }),
        200,
        { "cache-control": "no-store" },
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
