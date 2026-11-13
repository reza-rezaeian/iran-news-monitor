/* خبر ایران — Iran News Monitor (دوزبانه) */

const I18N = {
    fa: {
        brand: 'خبر ایران',
        subtitle: 'پایش لحظه‌ای اخبار ایران و بازار',
        refresh: 'به‌روزرسانی',
        gold: 'طلا (۱۸ عیار)',
        brent: 'نفت برنت',
        war: 'شاخص نزدیکی جنگ',
        all: 'همه',
        fa: 'فارسی',
        en: 'انگلیسی',
        he: 'عبری',
        ar: 'عربی',
        search: 'جستجو در عنوان‌ها…',
        translateTo: 'ترجمه به',
        loadMore: 'نمایش اخبار بیشتر',
        footer: 'خبر ایران — تجمیع اخبار ایران از منابع فارسی، انگلیسی، عبری و عربی',
        footerNote: 'شاخص نزدیکی جنگ یک تخمین آماری بر پایه کلمات کلیدی خبرهاست و توصیه یا پیش‌بینی نیست. قیمت‌ها از منابع عمومی دریافت می‌شوند و ممکن است با بازار داخلی تفاوت داشته باشند.',
        loading: 'در حال بارگذاری اخبار…',
        found: (n) => `${n} خبر یافت شد`,
        noNews: 'خبری یافت نشد',
        noNewsHint: 'فیلترها را تغییر دهید یا جستجو را پاک کنید.',
        errorTitle: 'خطا در دریافت اخبار',
        errorHint: 'اتصال به سرور برقرار نشد. مطمئن شوید server.py در حال اجراست.',
        read: 'ادامه خبر',
        translate: 'ترجمه گوگل',
        perGram: 'هر گرم',
        ounce: 'اونس جهانی',
        toman: 'تومان',
        warDetail: (total, high) => `${total} خبر ایران بررسی شد • ${high} خبر حساس`,
        updated: 'آخرین به‌روزرسانی:',
        now: 'همین حالا',
        minAgo: (n) => `${n} دقیقه پیش`,
        hourAgo: (n) => `${n} ساعت پیش`,
        dayAgo: (n) => `${n} روز پیش`,
        barrel: 'بشکه',
        noData: 'داده‌ای دریافت نشد',
        iranTag: 'ایران',
    },
    en: {
        brand: 'Iran News',
        subtitle: 'Live Iran news & market monitor',
        refresh: 'Refresh',
        gold: 'Gold (18K)',
        brent: 'Brent crude',
        war: 'War proximity index',
        all: 'All',
        fa: 'Persian',
        en: 'English',
        he: 'Hebrew',
        ar: 'Arabic',
        search: 'Search headlines…',
        translateTo: 'Translate to',
        loadMore: 'Load more news',
        footer: 'Iran News — headlines about Iran from Persian, English, Hebrew and Arabic sources',
        footerNote: 'The war proximity index is a keyword-based statistical estimate, not advice or a prediction. Prices come from public sources and may differ from local markets.',
        loading: 'Loading news…',
        found: (n) => `${n} stories found`,
        noNews: 'No stories found',
        noNewsHint: 'Change the filters or clear the search.',
        errorTitle: 'Could not load news',
        errorHint: 'Could not reach the server. Make sure server.py is running.',
        read: 'Read story',
        translate: 'Google Translate',
        perGram: 'per gram',
        ounce: 'Global ounce',
        toman: 'toman',
        warDetail: (total, high) => `${total} Iran stories analyzed • ${high} sensitive`,
        updated: 'Last updated:',
        now: 'just now',
        minAgo: (n) => `${n} min ago`,
        hourAgo: (n) => `${n} hr ago`,
        dayAgo: (n) => `${n} days ago`,
        barrel: 'barrel',
        noData: 'No data',
        iranTag: 'Iran',
    },
};

const LANG_LABEL = { fa: 'FA', en: 'EN', he: 'HE', ar: 'AR' };

const state = {
    uiLang: localStorage.getItem('uiLang') || 'fa',
    news: [],
    war: null,
    prices: null,
    updated: null,
    lang: 'all',
    query: '',
    targetLang: 'en',
    targetManual: false,
    visible: 24,
    loadingNews: false,
    loadingPrices: false,
};

const el = (id) => document.getElementById(id);
const t = (key) => (I18N[state.uiLang] || I18N.fa)[key];
const isFa = () => state.uiLang === 'fa';

/* ----------------------------- ابزارها ----------------------------- */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function fmtNum(n) {
    return Number(n).toLocaleString(isFa() ? 'fa-IR' : 'en-US');
}

function fmtPrice(n, digits = 2) {
    return Number(n).toLocaleString(isFa() ? 'fa-IR' : 'en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.max(0, Date.now() - d.getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('now');
    if (min < 60) return t('minAgo')(fmtNum(min));
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('hourAgo')(fmtNum(hr));
    const day = Math.floor(hr / 24);
    if (day < 30) return t('dayAgo')(fmtNum(day));
    return d.toLocaleDateString(isFa() ? 'fa-IR' : 'en-US');
}

function fmtClock() {
    const now = new Date();
    el('clock').textContent = now.toLocaleTimeString(isFa() ? 'fa-IR' : 'en-US', {
        hour: '2-digit', minute: '2-digit',
    });
}

/* ----------------------------- i18n ----------------------------- */
function applyLanguage() {
    const lang = state.uiLang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    localStorage.setItem('uiLang', lang);

    document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.dataset.i18n;
        const value = t(key);
        if (typeof value === 'string') node.textContent = value;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((node) => {
        node.placeholder = t(node.dataset.i18nPh);
    });
    document.querySelectorAll('.ui-lang-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.ui === lang);
    });

    if (!state.targetManual) {
        state.targetLang = lang === 'fa' ? 'en' : 'fa';
        el('translate-target').value = state.targetLang;
    }

    fmtClock();
    renderUpdated();
    renderPrices();
    renderWar();
    renderNews();
}

function renderUpdated() {
    if (!state.updated) return;
    const tm = new Date(state.updated).toLocaleTimeString(
        isFa() ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }
    );
    el('last-updated').textContent = `${t('updated')} ${tm}`;
}

/* ----------------------------- قیمت‌ها ----------------------------- */
function setChange(node, pct) {
    if (pct == null || isNaN(pct)) return;
    const up = pct >= 0;
    const span = document.createElement('span');
    span.className = 'change ' + (up ? 'up' : 'down');
    span.textContent = (up ? '▲ ' : '▼ ') + fmtPrice(Math.abs(pct), 2) + '٪';
    node.appendChild(span);
}

async function loadPrices(force = false) {
    if (state.loadingPrices) return;
    state.loadingPrices = true;
    try {
        const res = await fetch('/api/prices' + (force ? '?refresh=1' : ''), { cache: 'no-store' });
        state.prices = await res.json();
        renderPrices();
    } catch (err) {
        console.error('prices', err);
    } finally {
        state.loadingPrices = false;
    }
}

function renderPrices() {
    const p = state.prices;
    if (!p) return;

    // طلا: دلار بر گرم ۱۸ عیار
    if (p.gold_18k_usd != null) {
        el('gold-value').textContent = '$' + fmtPrice(p.gold_18k_usd, 2);
        el('gold-sub').textContent = isFa()
            ? `${t('perGram')} • ${t('ounce')}: ${fmtPrice(p.gold_usd_oz, 2)} دلار`
            : `${t('perGram')} • ${t('ounce')}: $${fmtPrice(p.gold_usd_oz, 2)}`;
    } else if (p.gold_usd_oz != null) {
        el('gold-value').textContent = '$' + fmtPrice(p.gold_usd_oz, 2);
        el('gold-sub').textContent = t('ounce');
    } else {
        el('gold-value').textContent = '—';
        el('gold-sub').textContent = t('noData');
    }

    for (const [key, valId, subId, label] of [
        ['oil_wti', 'wti-value', 'wti-sub', 'WTI'],
        ['oil_brent', 'brent-value', 'brent-sub', t('brent')],
    ]) {
        const o = p[key];
        const v = el(valId);
        const s = el(subId);
        v.textContent = '';
        s.textContent = '';
        if (o && o.price != null) {
            v.textContent = '$' + fmtPrice(o.price, 2);
            setChange(v, o.change);
            s.textContent = `${t('barrel')} • ${label}`;
        } else {
            v.textContent = '—';
            s.textContent = t('noData');
        }
    }
}

/* ----------------------------- شاخص جنگ ----------------------------- */
function renderWar() {
    const war = state.war;
    if (!war) return;

    const circumference = 2 * Math.PI * 52;
    const fg = el('gauge-fg');
    fg.style.strokeDasharray = circumference;
    fg.style.strokeDashoffset = circumference * (1 - war.score / 100);
    fg.style.stroke = war.color;

    el('war-score').textContent = fmtNum(war.score) + (isFa() ? '٪' : '%');
    el('war-label').textContent = isFa() ? war.label_fa : war.label_en;
    el('war-label').style.color = war.color;
    el('war-detail').textContent = t('warDetail')(fmtNum(war.total), fmtNum(war.high));
}

/* ----------------------------- اخبار ----------------------------- */
async function loadNews(force = false) {
    if (state.loadingNews) return;
    state.loadingNews = true;
    if (!state.news.length) showSkeletons();

    try {
        const url = '/api/news' + (force ? '?refresh=1' : '');
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();

        state.news = data.items || [];
        state.war = data.war;
        state.updated = data.updated;

        renderWar();
        renderNews();
        renderUpdated();
    } catch (err) {
        console.error('news', err);
        el('news-grid').innerHTML =
            `<div class="empty"><strong>${t('errorTitle')}</strong>${t('errorHint')}</div>`;
        el('result-count').textContent = '';
    } finally {
        state.loadingNews = false;
    }
}

function showSkeletons() {
    el('news-grid').innerHTML = Array.from({ length: 6 })
        .map(() => '<div class="skeleton"></div>').join('');
}

function filteredNews() {
    const q = state.query.trim().toLowerCase();
    return state.news.filter((it) => {
        if (state.lang !== 'all' && it.lang !== state.lang) return false;
        if (q) {
            const hay = `${it.title_fa} ${it.title_en} ${it.title} ${it.source}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

function titleFor(it) {
    return isFa() ? (it.title_fa || it.title) : (it.title_en || it.title);
}

function secondaryTitle(it) {
    const shown = titleFor(it);
    const original = it.title || '';
    if (!original || original === shown) return '';
    return original;
}

function renderNews() {
    if (!state.news.length) {
        if (!state.updated) {
            if (!state.loadingNews) showSkeletons();
            return;
        }
    }
    const list = filteredNews();
    const grid = el('news-grid');

    el('result-count').textContent = t('found')(fmtNum(list.length));

    if (!list.length) {
        grid.innerHTML =
            `<div class="empty"><strong>${t('noNews')}</strong>${t('noNewsHint')}</div>`;
        el('load-more').hidden = true;
        return;
    }

    grid.innerHTML = list.slice(0, state.visible).map(newsCard).join('');

    grid.querySelectorAll('.btn-translate').forEach((btn) => {
        btn.addEventListener('click', () => {
            openTranslate(decodeURIComponent(btn.dataset.title));
        });
    });

    el('load-more').hidden = list.length <= state.visible;
}

function newsCard(it) {
    const original = secondaryTitle(it);
    const sourceName = isFa() ? it.source : (it.source_en || it.source);
    const dir = isFa() ? 'rtl' : 'ltr';

    return `
        <article class="news-card">
            <div class="card-top">
                <span class="lang-badge" data-lang="${escapeHtml(it.lang)}">${escapeHtml(LANG_LABEL[it.lang] || it.lang)}</span>
                <span class="source">${escapeHtml(it.flag || '🌐')} ${escapeHtml(sourceName)}</span>
                <span class="iran-flag">${escapeHtml(t('iranTag'))}</span>
                <span class="time">${timeAgo(it.published)}</span>
            </div>
            <h3 class="news-title" dir="${dir}">${escapeHtml(titleFor(it))}</h3>
            ${original ? `<p class="news-original" dir="auto">${escapeHtml(original)}</p>` : ''}
            <div class="card-actions">
                <a class="btn-read" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">
                    ${escapeHtml(t('read'))} ↗
                </a>
                <button class="btn-translate" type="button"
                    data-title="${encodeURIComponent(it.title || '')}">
                    <span>文</span> ${escapeHtml(t('translate'))}
                </button>
            </div>
        </article>`;
}

function openTranslate(text) {
    const target = state.targetLang || (isFa() ? 'en' : 'fa');
    const url = 'https://translate.google.com/?sl=auto&tl=' +
        encodeURIComponent(target) + '&text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
}

/* ----------------------------- کنترل‌ها ----------------------------- */
function bindControls() {
    el('ui-lang').addEventListener('click', (e) => {
        const btn = e.target.closest('.ui-lang-btn');
        if (!btn || btn.dataset.ui === state.uiLang) return;
        state.uiLang = btn.dataset.ui;
        state.visible = 24;
        applyLanguage();
    });

    el('lang-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.lang-tab');
        if (!btn) return;
        document.querySelectorAll('.lang-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.lang = btn.dataset.lang;
        state.visible = 24;
        renderNews();
    });

    let timer = null;
    el('search').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            state.query = e.target.value;
            state.visible = 24;
            renderNews();
        }, 180);
    });

    el('translate-target').addEventListener('change', (e) => {
        state.targetLang = e.target.value;
        state.targetManual = true;
    });

    el('load-more').addEventListener('click', () => {
        state.visible += 24;
        renderNews();
    });

    el('refresh-btn').addEventListener('click', async () => {
        const b = el('refresh-btn');
        b.classList.add('spinning');
        await Promise.allSettled([loadNews(true), loadPrices(true)]);
        setTimeout(() => b.classList.remove('spinning'), 700);
    });
}

/* ----------------------------- شروع ----------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    bindControls();
    applyLanguage();
    setInterval(fmtClock, 1000);

    loadPrices();
    loadNews();

    setInterval(loadNews, 30 * 60 * 1000);   // هر ۳۰ دقیقه
    setInterval(loadPrices, 60 * 1000);      // هر ۱ دقیقه
});
