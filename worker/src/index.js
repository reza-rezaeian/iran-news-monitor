/**
 * Iran News Monitor — Cloudflare Worker (کاملاً داخل کلادفلر، پلن رایگان)
 *
 * ایده: هر invocation فقط یک فید را پردازش می‌کند تا زیر سقف ۱۰ms CPU بماند.
 *  - کرون هر دقیقه: یک فید (چرخشی) → پارس → فیلتر ایران → ترجمه → D1
 *  - کرون هر ۵ دقیقه: ساخت JSON نهایی داخل SQLite (json_group_array) → snapshots
 *  - کرون هر ۱۰ دقیقه: قیمت طلا/نفت → snapshots
 *  - /api/news و /api/prices فقط یک ردیف آماده را برمی‌گردانند
 */

const FEEDS = [
  { name: "بی‌بی‌سی فارسی", name_en: "BBC Persian", url: "http://feeds.bbci.co.uk/persian/rss.xml", lang: "fa", flag: "🇬🇧" },
  { name: "دویچه‌وله فارسی", name_en: "DW Persian", url: "https://rss.dw.com/xml/rss-per-all", lang: "fa", flag: "🇩🇪" },
  { name: "ایران اینترنشنال", name_en: "Iran International", url: "https://www.iranintl.com/feed", lang: "fa", flag: "🇮🇷" },
  { name: "یورونیوز فارسی", name_en: "Euronews Persian", url: "https://parsi.euronews.com/rss", lang: "fa", flag: "🇪🇺" },
  { name: "ایرنا", name_en: "IRNA", url: "https://www.irna.ir/rss", lang: "fa", flag: "🇮🇷", domestic: true },
  { name: "ایسنا", name_en: "ISNA", url: "https://www.isna.ir/rss", lang: "fa", flag: "🇮🇷", domestic: true },
  { name: "BBC World", name_en: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en", flag: "🇬🇧" },
  { name: "BBC Middle East", name_en: "BBC Middle East", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", lang: "en", flag: "🇬🇧" },
  { name: "Al Jazeera English", name_en: "Al Jazeera English", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "en", flag: "🇶🇦" },
  { name: "The Guardian", name_en: "The Guardian", url: "https://www.theguardian.com/world/rss", lang: "en", flag: "🇬🇧" },
  { name: "New York Times", name_en: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml", lang: "en", flag: "🇺🇸" },
  { name: "Euronews", name_en: "Euronews", url: "https://www.euronews.com/rss?level=theme&name=news", lang: "en", flag: "🇪🇺" },
  { name: "Jerusalem Post", name_en: "Jerusalem Post", url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx", lang: "en", flag: "🇮🇱" },
  { name: "Ynet", name_en: "Ynet", url: "https://www.ynet.co.il/Integration/StoryRss1854.xml", lang: "he", flag: "🇮🇱" },
  { name: "Maariv", name_en: "Maariv", url: "https://www.maariv.co.il/Rss/RssFeedsChadashot", lang: "he", flag: "🇮🇱" },
  { name: "Rotter", name_en: "Rotter", url: "https://rotter.net/rss/rotternews.xml", lang: "he", flag: "🇮🇱" },
  { name: "الجزیره", name_en: "Al Jazeera Arabic", url: "https://www.aljazeera.net/aljazeerarss/aba1290c-f2d2-4bb6-8cc4-6b6c0d1c2cbf", lang: "ar", flag: "🇶🇦" },
  { name: "BBC عربی", name_en: "BBC Arabic", url: "https://feeds.bbci.co.uk/arabic/rss.xml", lang: "ar", flag: "🇬🇧" },
  { name: "RT عربی", name_en: "RT Arabic", url: "https://arabic.rt.com/rss/", lang: "ar", flag: "🇷🇺" },
  { name: "الشرق الأوسط", name_en: "Asharq Al-Awsat", url: "https://aawsat.com/feed", lang: "ar", flag: "🇸🇦" },
  { name: "سبوتنیک عربی", name_en: "Sputnik Arabic", url: "https://arabic.sputniknews.com/export/rss2/archive/index.xml", lang: "ar", flag: "🇷🇺" },
];

// نام‌ها، نهادها و شهرهای ایران — به چهار زبان
const IRAN_TERMS = [
  // فارسی
  "ایران", "ایرانی", "تهران", "سپاه", "پاسداران", "بسیج", "خامنه", "خمینی",
  "رئیسی", "پزشکیان", "قالیباف", "احمدی‌نژاد", "ظریف", "عراقچی", "برجام",
  "ریال", "تومان", "هسته‌ای ایران", "غنی‌سازی", "سازمان انرژی اتمی",
  "بانک مرکزی", "مجلس شورای اسلامی", "شورای نگهبان", "قوه قضائیه",
  "نیروی انتظامی", "ارتش ایران", "وزارت خارجه", "خلیج فارس", "تنگه هرمز",
  "نفت ایران", "آبادان", "اهواز", "اصفهان", "مشهد", "شیراز", "تبریز",
  "کرمانشاه", "اردبیل", "بندرعباس", "قم", "کرج", "رشت", "یزد", "کرمان",
  "همدان", "زاهدان", "بوشهر", "ساری", "ارومیه", "سنندج", "گرگان", "قزوین",
  "اراک", "بجنورد", "بیرجند", "ایلام", "شهرکرد", "سمنان", "زنجان", "بابل",
  "آمل", "رفسنجان", "خرمشهر", "ماهشهر", "عسلویه", "کیش", "قشم", "چابهار",
  "انزلی", "مراغه", "خوی", "سیستان", "بلوچستان", "مازندران", "گیلان",
  "خوزستان", "گلستان", "نطنز", "فردو", "بوشهر", "پارچین", "دامغان",
  // English
  "iran", "iranian", "tehran", "teheran", "irgc", "khamenei", "khomeini",
  "pezeshkian", "raisi", "rouhani", "zarif", "araghchi", "islamic republic",
  "persian gulf", "strait of hormuz", "jcpoa", "iran nuclear", "iranian oil",
  "mahsa amini", "morality police", "revolutionary guard", "ayatollah",
  "quds force", "basij", "natanz", "fordow", "Isfahan", "tabriz", "mashhad",
  "shiraz", "ahvaz", "abadan", "kermanshah", "hormuz", "khuzestan",
  "baluchistan", "caspian", "arak", "bushehr",
  // عربی
  "إيران", "إيراني", "طهران", "الحرس الثوري", "خامنئي", "بزشكيان",
  "عراقجي", "الخليج الفارسي", "مضيق هرمز", "الاتفاق النووي",
  "تخصيب اليورانيوم", "أصفهان", "تبريز", "مشهد", "شيراز", "الأهواز",
  "عبادان", "كرمانشاه", "هرمز", "نطنز", "فردو",
  // عبری
  "איראן", "איראני", "טהרן", "חמינאי", "משמרות המהפכה", "פזשכיאן",
  "ראיסי", "זריף", "המפרץ הפרסי", "מצר הורמוז", "הגרעין האיראני",
  "איספהאן", "טהראן", "ח'וזיסטן", "נתנז", "פורדו",
];

const HIGH_WAR = [
  "جنگ", "حمله", "موشک", "بمباران", "هجوم", "قصف", "حرب", "اشغال",
  "war", "attack", "missile", "airstrike", "bombing", "invasion",
  "מלחמה", "תקיפה", "טילים", "פיגוע",
];

const MED_WAR = [
  "تهدید", "نظامی", "تنش", "تحریم", "پهپاد", "هسته‌ای", "غنی‌سازی",
  "threat", "military", "tension", "sanction", "drone", "nuclear",
  "enrichment", "איום", "צבא", "מתיחות", "סנקציות", "גרעין",
  "تهديد", "عسكري", "توتر", "عقوبات", "نووي",
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const GOOGLE_TR = "https://clients5.google.com/translate_a/t";
const MAX_ITEMS = 40;
const LIMIT = 160;

const SOURCES_JSON = JSON.stringify(
  FEEDS.map((f) => ({ name: f.name, name_en: f.name_en, lang: f.lang, flag: f.flag })),
);

/* ----------------------------- regexes ----------------------------- */

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// عبارت‌های کوتاه باید مرز واژه داشته باشند تا «قم» با «برقم» یا «software» با «war» تطبیق نکند
function termPattern(term, shortMax) {
  const t = term.toLowerCase();
  const escaped = escRe(t);
  const latin = /^[a-z0-9 .'-]+$/i.test(t);
  if (latin && t.length <= 4) return `\\b${escaped}\\b`;
  if (t.length <= shortMax) return `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
  return escaped;
}

const buildTermRegex = (terms, shortMax = 2) =>
  new RegExp(terms.map((t) => termPattern(t, shortMax)).join("|"), "iu");

let IRAN_RE = null;
let HIGH_RE = null;
let MED_RE = null;

function ensureRegex() {
  if (IRAN_RE) return;
  IRAN_RE = buildTermRegex(IRAN_TERMS, 3);
  HIGH_RE = buildTermRegex(HIGH_WAR);
  MED_RE = buildTermRegex(MED_WAR);
}

/* ----------------------------- parsing ----------------------------- */

function cleanText(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = s.replace(/<[^>]*>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
  return s.replace(/\s+/g, " ").trim();
}

function pick(block, names) {
  for (const n of names) {
    const re = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i");
    const m = block.match(re);
    if (m) return m[1];
  }
  return "";
}

function pickLink(block) {
  let m = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  if (m) return m[1];
  m = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  return m ? cleanText(m[1]) : "";
}

function parseFeed(xml, feed) {
  const out = [];
  const re = /<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < MAX_ITEMS) {
    const block = m[0];
    const title = cleanText(pick(block, ["title"]));
    if (!title) continue;

    const desc = cleanText(pick(block, ["description", "summary", "content"])).slice(0, 280);
    const dateStr = cleanText(pick(block, ["pubdate", "published", "updated", "date"]));
    const dt = dateStr ? new Date(dateStr) : null;
    const published = dt && !isNaN(dt.getTime()) ? dt.toISOString() : null;

    out.push({
      title,
      link: pickLink(block) || "#",
      description: desc,
      published,
      source: feed.name,
      source_en: feed.name_en,
      lang: feed.lang,
      flag: feed.flag,
      domestic: feed.domestic ? 1 : 0,
    });
  }
  return out;
}

function itemId(title) {
  // همان الگوریتم seed پایتون: فقط حروف/ارقام، هش djb2، خروجی hex
  const norm = Array.from(title.toLowerCase())
    .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
    .join("")
    .slice(0, 90);
  let h = 5381;
  for (const ch of norm) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(16);
}

/* ----------------------------- translation ----------------------------- */

async function translateBatch(texts, sl, tl) {
  const params = new URLSearchParams({ client: "dict-chrome-ex", sl, tl });
  for (const t of texts) params.append("q", t.slice(0, 300));

  const res = await fetch(`${GOOGLE_TR}?${params.toString()}`, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);

  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((x) => (typeof x === "string" ? x : ""));
}

async function translateItems(items, sl, tl) {
  const field = tl === "fa" ? "title_fa" : "title_en";
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    try {
      const outs = await translateBatch(chunk.map((it) => it.title), sl, tl);
      chunk.forEach((it, k) => {
        const v = (outs[k] || "").trim();
        if (v) it[field] = v;
      });
    } catch (err) {
      console.log(`translate ${sl}->${tl} failed: ${err}`);
    }
  }
}

/* ----------------------------- ingest ----------------------------- */

async function ingest(env, feedIndex) {
  ensureRegex();
  const feed = FEEDS[feedIndex % FEEDS.length];
  const t0 = Date.now();

  const res = await fetch(feed.url, {
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();

  const parsed = parseFeed(xml, feed);
  const candidates = [];

  for (const it of parsed) {
    const text = `${it.title} ${it.description}`;
    if (!IRAN_RE.test(text)) continue;
    it.id = itemId(it.title);
    it.high = HIGH_RE.test(text) ? 1 : 0;
    it.medium = it.high ? 0 : MED_RE.test(text) ? 1 : 0;
    candidates.push(it);
  }
  if (!candidates.length) {
    console.log(`[ingest ${feed.name}] no iran items (${parsed.length} parsed)`);
    return;
  }

  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const existing = await env.DB
    .prepare(`SELECT id FROM items WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const have = new Set((existing.results || []).map((r) => r.id));
  const fresh = candidates.filter((c) => !have.has(c.id));

  if (fresh.length) {
    const jobs = new Map();
    for (const it of fresh) {
      if (it.lang === "fa") it.title_fa = it.title;
      if (it.lang === "en") it.title_en = it.title;
      const targets = it.lang === "fa" ? ["en"] : it.lang === "en" ? ["fa"] : ["fa", "en"];
      for (const tl of targets) {
        const key = `${it.lang}>${tl}`;
        if (!jobs.has(key)) jobs.set(key, { sl: it.lang, tl, items: [] });
        jobs.get(key).items.push(it);
      }
    }
    for (const job of jobs.values()) {
      await translateItems(job.items, job.sl, job.tl);
    }
    for (const it of fresh) {
      if (!it.title_fa) it.title_fa = it.title;
      if (!it.title_en) it.title_en = it.title;
    }

    const stmt = env.DB.prepare(
      `INSERT OR IGNORE INTO items
       (id, title, title_fa, title_en, link, source, source_en, lang, flag, published, high, medium, domestic)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    await env.DB.batch(
      fresh.map((it) =>
        stmt.bind(
          it.id, it.title, it.title_fa, it.title_en, it.link,
          it.source, it.source_en, it.lang, it.flag, it.published,
          it.high, it.medium, it.domestic,
        ),
      ),
    );
  }

  console.log(
    `[ingest ${feed.name}] ${parsed.length} parsed, ${candidates.length} iran, ` +
    `${fresh.length} new, ${Date.now() - t0}ms`,
  );
}

/* ----------------------------- assemble ----------------------------- */

function warFrom(high, medium, total) {
  const hi = Number(high) || 0;
  const me = Number(medium) || 0;
  const tot = Math.max(Number(total) || 0, 1);
  const score = Math.min(100, Math.max(0, Math.round(((hi * 3 + me) / tot) * 30)));

  let label_fa, label_en, color;
  if (score < 20) [label_fa, label_en, color] = ["کم", "Low", "#2e7d32"];
  else if (score < 40) [label_fa, label_en, color] = ["نسبتاً کم", "Fairly low", "#689f38"];
  else if (score < 60) [label_fa, label_en, color] = ["متوسط", "Moderate", "#f9a825"];
  else if (score < 80) [label_fa, label_en, color] = ["بالا", "High", "#ef6c00"];
  else [label_fa, label_en, color] = ["بسیار بالا", "Very high", "#c62828"];

  return {
    score, label: label_fa, label_fa, label_en, color,
    high: hi, medium: me, total: Number(total) || 0, scope: "iran",
  };
}

async function assemble(env) {
  const t0 = Date.now();
  const row = await env.DB.prepare(
    `SELECT json_group_array(json_object(
        'title', title,
        'title_fa', title_fa,
        'title_en', title_en,
        'link', link,
        'source', source,
        'source_en', source_en,
        'lang', lang,
        'flag', flag,
        'published', published,
        'sensitive', high,
        'domestic', domestic
      )) AS items,
      COUNT(*) AS total,
      COALESCE(SUM(high), 0) AS high,
      COALESCE(SUM(medium), 0) AS medium
     FROM (SELECT * FROM items ORDER BY published DESC LIMIT ?)`,
  ).bind(LIMIT).first();

  const total = Number(row?.total) || 0;
  if (!total) {
    console.log("[assemble] no items yet");
    return;
  }

  const updated = new Date().toISOString();
  const war = warFrom(row.high, row.medium, total);
  const body =
    `{"updated":${JSON.stringify(updated)},"count":${total},"items":${row.items || "[]"},` +
    `"war":${JSON.stringify(war)},"sources":${SOURCES_JSON}}`;

  await env.DB.prepare(
    `INSERT INTO snapshots (key, body, updated, count) VALUES ('news', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET body=excluded.body, updated=excluded.updated, count=excluded.count`,
  ).bind(body, updated, total).run();

  // پاکسازی آیتم‌های قدیمی‌تر از ۴ روز
  const cutoff = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM items WHERE published IS NOT NULL AND published < ?")
    .bind(cutoff)
    .run();

  console.log(`[assemble] ${total} items, ${body.length} bytes, ${Date.now() - t0}ms`);
}

/* ----------------------------- prices ----------------------------- */

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function cnbcPrice(symbol) {
  const url =
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=" +
    encodeURIComponent(symbol) +
    "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1";
  const d = await fetchJson(url);
  const q = d.FormattedQuoteResult.FormattedQuote[0];
  const pct = parseFloat(String(q.change_pct || "").replace("%", "").trim());
  return {
    price: parseFloat(q.last),
    change: Number.isFinite(pct) ? pct : null,
    symbol,
    name: q.name,
  };
}

async function yahooPrice(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?interval=1d&range=1d";
  const d = await fetchJson(url);
  const meta = d.chart.result[0].meta;
  return {
    price: meta.regularMarketPrice,
    change: meta.regularMarketChangePercent,
    symbol,
  };
}

async function refreshPrices(env) {
  const t0 = Date.now();
  const out = { updated: new Date().toISOString() };

  const [goldRes, fxRes] = await Promise.allSettled([
    fetchJson("https://api.gold-api.com/price/XAU"),
    fetchJson("https://open.er-api.com/v6/latest/USD"),
  ]);

  if (goldRes.status === "fulfilled") {
    const usdOz = parseFloat(goldRes.value.price);
    if (Number.isFinite(usdOz)) {
      out.gold_usd_oz = Math.round(usdOz * 100) / 100;
      const gram24 = usdOz / 31.1034768;
      out.gold_18k_usd = Math.round(gram24 * 0.75 * 100) / 100;
      if (fxRes.status === "fulfilled") {
        const irr = parseFloat(fxRes.value?.rates?.IRR);
        if (Number.isFinite(irr)) {
          const toman = irr / 10;
          out.gold_18k_toman = Math.round(gram24 * 0.75 * toman);
          out.usd_toman = Math.round(toman);
        }
      }
    }
  }

  const oils = await Promise.allSettled([
    cnbcPrice("@CL.1"),
    cnbcPrice("@LCO.1"),
  ]);

  if (oils[0].status === "fulfilled") out.oil_wti = oils[0].value;
  else {
    try { out.oil_wti = await yahooPrice("CL=F"); } catch (e) { console.log("wti failed", e); }
  }

  if (oils[1].status === "fulfilled") out.oil_brent = oils[1].value;
  else {
    try { out.oil_brent = await yahooPrice("BZ=F"); } catch (e) { console.log("brent failed", e); }
  }

  const body = JSON.stringify(out);
  await env.DB.prepare(
    `INSERT INTO snapshots (key, body, updated, count) VALUES ('prices', ?, ?, 0)
     ON CONFLICT(key) DO UPDATE SET body=excluded.body, updated=excluded.updated`,
  ).bind(body, out.updated).run();

  console.log(`[prices] gold=${out.gold_18k_usd} wti=${out.oil_wti?.price} in ${Date.now() - t0}ms`);
}

/* ----------------------------- API ----------------------------- */

async function snapshot(env, key) {
  const row = await env.DB.prepare("SELECT body FROM snapshots WHERE key = ?").bind(key).first();
  return row ? row.body : null;
}

function json(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/news" || url.pathname === "/api/prices") {
      const key = url.pathname === "/api/news" ? "news" : "prices";
      try {
        if (url.searchParams.get("refresh") === "1") {
          if (key === "news") await assemble(env);
          else await refreshPrices(env);
        }
        const body = await snapshot(env, key);
        if (!body) return json(JSON.stringify({ error: "warming_up", message: "داده هنوز آماده نشده" }), 503);
        return json(body);
      } catch (err) {
        return json(JSON.stringify({ error: String(err) }), 500);
      }
    }

    if (url.pathname === "/api/health") {
      let dbOk = false;
      try {
        const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM items").first();
        dbOk = true;
        return json(JSON.stringify({ ok: true, items: r.n, time: new Date().toISOString() }));
      } catch (err) {
        return json(JSON.stringify({ ok: false, db: dbOk, error: String(err) }), 500);
      }
    }

    if (url.pathname === "/api/admin/run") {
      const key = url.searchParams.get("key");
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
        return json(JSON.stringify({ error: "forbidden" }), 403);
      }
      const mode = url.searchParams.get("mode") || "ingest";
      const t0 = Date.now();
      try {
        if (mode === "ingest") {
          const i = Number(url.searchParams.get("i") || 0);
          await ingest(env, i);
          return json(JSON.stringify({ ok: true, mode, feed: FEEDS[i % FEEDS.length].name, ms: Date.now() - t0 }));
        }
        if (mode === "assemble") {
          await assemble(env);
          return json(JSON.stringify({ ok: true, mode, ms: Date.now() - t0 }));
        }
        if (mode === "prices") {
          await refreshPrices(env);
          return json(JSON.stringify({ ok: true, mode, ms: Date.now() - t0 }));
        }
        return json(JSON.stringify({ error: "unknown mode" }), 400);
      } catch (err) {
        return json(JSON.stringify({ ok: false, error: String(err), ms: Date.now() - t0 }), 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "* * * * *") {
      const idx = Math.floor(Date.now() / 60000) % FEEDS.length;
      ctx.waitUntil(ingest(env, idx).catch((e) => console.log("ingest error:", e)));
    } else if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(assemble(env).catch((e) => console.log("assemble error:", e)));
    } else if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(refreshPrices(env).catch((e) => console.log("prices error:", e)));
    }
  },
};
