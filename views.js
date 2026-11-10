// Server-rendered HTML. No frameworks, no AI.
import { CATEGORIES, ageLabel } from './db.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABEL = {
  symptom: 'Symptom', temperature: 'Temperature', medicine: 'Medicine', feeding: 'Feeding',
  sleep: 'Sleep', doctor_visit: 'Doctor visit', vaccine: 'Vaccine', note: 'Note',
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayLabel(when) {
  const [y, m, d] = when.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[dow]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
function timeLabel(when) {
  const [h, mi] = when.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const CSS = `
:root{--bg:#f7f6fd;--card:#fff;--ink:#1f1d3d;--muted:#6b6a85;--line:#e5e3f1;--brand:#4b45b0;--brand-ink:#fff;--soft:#eeecfb;--flag:#c2461f;--flag-soft:#fdeeea;--danger:#a3322a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand)}
.wrap{max-width:760px;margin:0 auto;padding:0 18px 64px}
header.top{background:var(--card);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:18px;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
.logo{font-weight:700;font-size:19px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.logo span{color:var(--brand)}
nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
nav a{padding:7px 12px;border-radius:999px;text-decoration:none;color:var(--muted);font-size:14.5px;font-weight:500}
nav a.on{background:var(--soft);color:var(--brand)}
h1{font-size:26px;line-height:1.2;margin:28px 0 6px;letter-spacing:-.02em}
h2{font-size:15px;margin:28px 0 10px;color:var(--muted);font-weight:600}
p.lead{color:var(--muted);margin:0 0 20px}
.btn{display:inline-block;background:var(--brand);color:var(--brand-ink);border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--line);background:var(--card)}
.btn.danger{background:transparent;color:var(--danger);border:1px solid var(--line)}
.btn.small{padding:6px 11px;font-size:14px;border-radius:8px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 4px}
.chips a{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);text-decoration:none;color:var(--ink);font-size:14.5px}
.chips a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}
.card.flag{border-color:var(--flag);box-shadow:inset 4px 0 0 var(--flag)}
.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--muted)}
.tag{background:var(--soft);color:var(--brand);border-radius:6px;padding:2px 8px;font-weight:600;font-size:12.5px}
.tag.flag{background:var(--flag-soft);color:var(--flag)}
.tag.plain{background:#eeedf3;color:var(--muted)}
.card h3{margin:8px 0 4px;font-size:17.5px;line-height:1.3}
.details{white-space:pre-wrap;margin:6px 0 0;color:#34325a}
.temp{font-weight:600;color:var(--ink)}
.actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.actions form{margin:0}
label{display:block;font-weight:600;font-size:14.5px;margin:16px 0 6px}
input[type=text],input[type=datetime-local],select,textarea{width:100%;padding:10px 12px;border:1px solid #cfcce0;border-radius:10px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:150px;resize:vertical}
input:focus,select:focus,textarea:focus,.btn:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.check{display:flex;gap:10px;align-items:center;margin-top:16px;font-weight:500}
.check input{width:18px;height:18px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.copy{display:flex;gap:8px}
.copy input{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px}
ol.steps{padding-left:22px}ol.steps li{margin:8px 0}
.note{background:var(--soft);border-radius:12px;padding:12px 16px;color:#2f2b6b;font-size:15px}
.err{background:#fbe9e7;border-radius:12px;padding:12px 16px;color:var(--danger);margin-top:16px}
.empty{text-align:center;padding:36px 20px;color:var(--muted)}
.say{background:#fbfaff;border:1px dashed #cfcce0;border-radius:10px;padding:10px 14px;margin:8px 0;font-style:italic}
footer{color:var(--muted);font-size:13.5px;margin-top:40px;border-top:1px solid var(--line);padding-top:16px}
.hero{padding:44px 0 8px}.hero h1{font-size:36px;max-width:16ch}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}
.grid3 .card{margin:0}.grid3 b{display:block;margin-bottom:4px}
@media(max-width:620px){.two,.grid3{grid-template-columns:1fr}.hero h1{font-size:29px}nav{margin-left:0}}
.wrap.wide{max-width:1120px}
.profile{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:28px 0 8px}
.avatar{width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#8b7fe8,#4b45b0);color:#fff;font-size:36px;font-weight:700;display:grid;place-items:center;flex:none}
.pname{padding-right:24px;border-right:1px solid var(--line);margin-right:4px}
.pname h1{margin:0;font-size:34px}.pname p{margin:2px 0 0;color:var(--muted)}
.stats{display:flex;gap:12px;flex-wrap:wrap}
.stat{display:flex;gap:12px;align-items:center;background:var(--soft);border-radius:14px;padding:12px 16px}
.stat div span{display:block;font-size:13.5px;color:var(--muted)}.stat b{font-size:16px}
.ico{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none}
.stat .ico,.counts .ico{width:32px;height:32px}.stat .ico svg,.counts .ico svg{width:17px;height:17px}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:28px;align-items:start;margin-top:18px}
.tlhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tlhead h2.big{font-size:22px;color:var(--ink);margin:0;margin-right:auto;letter-spacing:-.01em}
.tlhead select{width:auto;padding:8px 12px}
.entry{display:grid;grid-template-columns:128px 40px minmax(0,1fr);gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}
.entry.flag{background:var(--flag-soft);border-color:#f0a99b}
.entry.empty{display:block;text-align:center;color:var(--muted);padding:32px 20px}
.entry .when b{display:block;font-size:15px}.entry .when span{display:block;color:var(--muted);font-size:14px}
.entry .when .who{color:var(--brand);font-weight:600;margin-top:2px}
.entry h3{margin:8px 0 2px;font-size:17px;line-height:1.3}
.tag.c-symptom{background:#fde3df;color:#b93a26}.tag.c-temperature{background:#dff3e8;color:#1f7a4d}.tag.c-medicine{background:#ebe5fb;color:#5a3fb5}
.tag.c-feeding{background:#deedfb;color:#1f69ad}.tag.c-sleep{background:#daf1ed;color:#17786a}.tag.c-doctor_visit{background:#e1e9fa;color:#2c55a8}
.tag.c-vaccine{background:#fbecd7;color:#9a5f14}.tag.c-note{background:#eeedf3;color:#55546b}
.tag{text-transform:uppercase;letter-spacing:.03em}
.tag.flag{background:#fbd9c9;color:#a3401a}
.side{border-radius:16px;padding:18px;margin-bottom:16px}
.side h3{margin:0 0 4px;font-size:18px}.side p{margin:6px 0 12px;font-size:14.5px}.side .sub{color:var(--muted);margin:0 0 8px}
.side.green{background:#e3f6ee}.side.violet{background:#e9e6fb}.side.amber{background:#fdf1d8}
.counts{list-style:none;margin:0;padding:0}.counts li{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:15px}
.counts li span:nth-child(2){flex:1}.counts b{font-size:16px}
@media(max-width:900px){.cols{grid-template-columns:1fr}.pname{border-right:0;padding-right:0}}
@media(max-width:620px){.entry{grid-template-columns:40px minmax(0,1fr)}.entry .when{grid-column:1/-1;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.pname h1{font-size:28px}.avatar{width:64px;height:64px;font-size:28px}}
@media print{.cols{grid-template-columns:1fr}.entry{break-inside:avoid}}
.mini{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#8b7fe8,#4b45b0);color:#fff;font-weight:700;font-size:14px;display:grid;place-items:center;flex:none}
.mini.big{width:44px;height:44px;font-size:19px}
.switch{position:relative}
.switch summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 10px 5px 5px;border-radius:999px;background:var(--soft);color:var(--brand);font-weight:600;font-size:14.5px}
.switch summary::-webkit-details-marker{display:none}
.switch .menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px rgba(31,29,61,.14);padding:6px;min-width:230px;z-index:10}
.switch .menu a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;text-decoration:none;color:var(--ink)}
.switch .menu a:hover,.switch .menu a.on{background:var(--soft)}
.switch .menu small{display:block;color:var(--muted);font-size:12.5px}
.switch .menu a.manage{border-top:1px solid var(--line);border-radius:0 0 10px 10px;margin-top:4px;color:var(--brand);font-weight:600;font-size:14.5px}
.kid{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:10px 0;flex-wrap:wrap}
.kinfo{flex:1;min-width:140px}.kinfo b{display:block}.kinfo span{color:var(--muted);font-size:14.5px}
input[type=date]{width:100%;padding:10px 12px;border:1px solid #cfcce0;border-radius:10px;font:inherit;background:#fff;color:var(--ink)}
@media print{header.top,.noprint{display:none!important}body{background:#fff}.card{break-inside:avoid}}
`;

function page({ title, nav = '', body, head = '', wide = false }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${CSS}</style>${head}
</head><body>
<header class="top"><div class="wrap${wide ? ' wide' : ''}"><a class="logo" href="/">Kid<span>Log</span></a>${nav}</div></header>
<main class="wrap${wide ? ' wide' : ''}">${body}
<footer>KidLog records what you tell it so you can show your doctor. It does not give medical advice. If you are worried about your child, contact your doctor.</footer>
</main></body></html>`;
}

function spaceNav(space, on, extra = '') {
  const b = `/f/${esc(space.key)}`;
  const a = (href, id, label) => `<a href="${href}"${on === id ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
  return `<nav>${a(b, 'timeline', 'Timeline')}${a(b + '/kids', 'kids', 'Children')}${a(b + '/connect', 'connect', 'Connect Claude')}${a(b + '/share', 'share', 'Share with doctor')}</nav>${extra}`;
}

const initial = (name) => esc(String(name).trim().charAt(0).toUpperCase() || '?');

// Top-right child switcher, as a plain <details> menu (no script needed).
function switcher({ children, shown, hrefFor, manageHref }) {
  if (!children.length) return '';
  const item = (c) => `<a href="${hrefFor(c.child)}"${shown && shown.id === c.id ? ' class="on"' : ''}><span class="mini">${initial(c.child)}</span><span><b>${esc(c.child)}</b>${c.dob ? `<small>${esc(ageLabel(c.dob))}</small>` : ''}</span></a>`;
  return `<details class="switch noprint"><summary aria-label="Switch child"><span class="mini">${shown ? initial(shown.child) : '&#8226;&#8226;'}</span><span class="swname">${shown ? esc(shown.child) : 'All children'}</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
    <div class="menu">${children.map(item).join('')}
      ${children.length > 1 ? `<a href="${hrefFor('')}"${shown ? '' : ' class="on"'}><span class="mini">&#8226;&#8226;</span><span><b>All children</b></span></a>` : ''}
      ${manageHref ? `<a class="manage" href="${manageHref}">Add or edit children</a>` : ''}
    </div></details>`;
}

const ICON = {
  symptom: ['#e5533d', '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
  temperature: ['#2fa36b', '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'],
  medicine: ['#7c5cd6', '<path d="M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>'],
  feeding: ['#2f8fe0', '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-2 2-3 5-3 9h3v9"/>'],
  sleep: ['#1f9d8a', '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.5a6.6 6.6 0 0 0 9.5 9.5z"/>'],
  doctor_visit: ['#3b6fd4', '<path d="M12 6v12M6 12h12"/><rect x="3" y="3" width="18" height="18" rx="5"/>'],
  vaccine: ['#d9892b', '<path d="M17 3l4 4M19 5l-3 3M14 6l4 4M16 8l-8.5 8.5H4.5v-3L13 5M4.5 19.5L2 22"/>'],
  note: ['#6b6a85', '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'],
};
const icon = (cat) => {
  const [color, paths] = ICON[cat] || ICON.note;
  return `<span class="ico" style="background:${color}" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
};
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function shortDay(when) {
  const [y, m, d] = when.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${SHORT_DAYS[dow]}, ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function entryCard(e, { base, readOnly, showChild }) {
  const tags = [
    `<span class="tag c-${esc(e.category)}">${esc(LABEL[e.category] || e.category)}</span>`,
    e.flagged ? '<span class="tag flag">Raise with doctor</span>' : '',
    !readOnly && e.source === 'claude' ? '<span class="tag plain">Added by Claude</span>' : '',
    !readOnly && e.edited ? '<span class="tag plain">Edited</span>' : '',
  ].join('');
  const actions = readOnly ? '' : `<div class="actions noprint">
    <a class="btn ghost small" href="${base}/e/${e.id}">Edit entry</a>
    <form method="post" action="${base}/e/${e.id}/flag"><button class="btn ghost small">${e.flagged ? 'Remove doctor flag' : 'Flag for doctor'}</button></form>
  </div>`;
  return `<article class="entry${e.flagged ? ' flag' : ''}">
    <div class="when"><b>${shortDay(e.occurred_at)}</b><span>${timeLabel(e.occurred_at)}</span>${showChild ? `<span class="who">${esc(e.child)}</span>` : ''}</div>
    ${icon(e.category)}
    <div class="body">
      <div class="meta">${tags}</div>
      <h3>${esc(e.title)}</h3>
      ${e.temperature ? `<div class="temp">Temperature: ${esc(e.temperature)}</div>` : ''}
      ${e.details ? `<p class="details">${esc(e.details)}</p>` : ''}
      ${actions}
    </div>
  </article>`;
}

const RANGES = [['all', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];

const qs = (child, flagged, range) => {
  const p = new URLSearchParams();
  if (child) p.set('child', child);
  if (flagged) p.set('flagged', '1');
  if (range && range !== 'all') p.set('range', range);
  const s = p.toString();
  return s ? `?${s}` : '';
};

function flagChip(current, base, flagged, range) {
  return `<div class="chips noprint"><a href="${base + qs(current, !flagged, range)}"${flagged ? ' class="on"' : ''}>${flagged ? 'Showing flagged only' : 'Flagged only'}</a></div>`;
}

const pickShown = (children, child) =>
  child ? children.find((c) => c.child.toLowerCase() === child.toLowerCase()) : children.length === 1 ? children[0] : null;

// Shared by the family timeline and the read-only doctor view.
function board({ space, base, all, entries, children, child, flagged, range, readOnly, shareHref, connectHref }) {
  const shown = pickShown(children, child);
  const age = shown ? ageLabel(shown.dob) : '';
  const total = shown ? shown.entries : all.length;
  const name = shown ? shown.child : space.name;
  const latest = (cat) => {
    const e = all.find((x) => x.category === cat);
    return e ? shortDay(e.occurred_at).replace(/^\w+, /, '') : 'None logged';
  };
  const count = (cat) => entries.filter((e) => e.category === cat).length;
  const flaggedCount = all.filter((e) => e.flagged).length;
  const stat = (cat, label, value) => `<div class="stat">${icon(cat)}<div><span>${label}</span><b>${esc(value)}</b></div></div>`;
  const rangeLabel = (RANGES.find((r) => r[0] === range) || RANGES[0])[1];
  const row = (cat, label, n) => `<li>${icon(cat)}<span>${label}</span><b>${n}</b></li>`;
  const list = entries.length
    ? entries.map((e) => entryCard(e, { base, readOnly, showChild: !shown })).join('')
    : readOnly || all.length
      ? '<div class="entry empty">No entries match this view.</div>'
      : `<div class="entry empty"><div><p><b>Nothing here yet.</b></p><p>Connect Claude and tell it what happened, or add an entry yourself.</p>
         <p class="row" style="justify-content:center"><a class="btn" href="${connectHref}">Connect Claude</a><a class="btn ghost" href="${base}/new">Add an entry</a></p></div></div>`;
  return `<section class="profile">
      <div class="avatar" aria-hidden="true">${initial(name)}</div>
      <div class="pname"><h1>${esc(name)}</h1>
        <p>${shown ? (age ? esc(age) : readOnly ? '' : `<a href="${base}/kids/${shown.id}">Add birth date</a>`) : `${children.length} ${children.length === 1 ? 'child' : 'children'}`}${shown && (age || !readOnly) ? ' · ' : shown ? '' : ' · '}${total} ${total === 1 ? 'entry' : 'entries'} on record${shown && !readOnly && age ? ` · <a href="${base}/kids/${shown.id}">Edit profile</a>` : ''}</p></div>
      <div class="stats">
        ${stat('doctor_visit', 'Last doctor visit', latest('doctor_visit'))}
        ${stat('vaccine', 'Last vaccine', latest('vaccine'))}
        ${stat('symptom', 'Flagged for doctor', String(flaggedCount))}
      </div>
    </section>
    <div class="cols">
      <div>
        <div class="tlhead">
          <h2 class="big">Health timeline</h2>
          <form method="get" action="${base}" class="noprint">
            ${child ? `<input type="hidden" name="child" value="${esc(child)}">` : ''}${flagged ? '<input type="hidden" name="flagged" value="1">' : ''}
            <select name="range" aria-label="Period" onchange="this.form.submit()">${RANGES.map(([v, l]) => `<option value="${v}"${v === range ? ' selected' : ''}>${l}</option>`).join('')}</select>
            <noscript><button class="btn small">Show</button></noscript>
          </form>
          ${readOnly ? '<button class="btn ghost noprint" onclick="window.print()">Print</button>' : `<a class="btn noprint" href="${base}/new${shown ? `?child=${encodeURIComponent(shown.child)}` : ''}">Add an entry</a>`}
        </div>
        ${flagChip(child, base, flagged, range)}
        ${list}
      </div>
      <aside>
        <div class="side green"><h3>Quick overview</h3><p class="sub">${rangeLabel}</p><ul class="counts">
          ${row('symptom', 'Symptom entries', count('symptom'))}
          ${row('temperature', 'Temperature readings', count('temperature'))}
          ${row('medicine', 'Medicine doses', count('medicine'))}
          ${row('feeding', 'Feeding notes', count('feeding'))}
          ${row('sleep', 'Sleep notes', count('sleep'))}
        </ul></div>
        ${readOnly ? '' : `<div class="side violet noprint"><h3>Doctor visit</h3><p>Send a read-only copy of this timeline. Flagged entries are highlighted.</p><a class="btn ghost small" href="${shareHref}">Share with doctor</a></div>
        <div class="side amber noprint"><h3>Tell Claude</h3><p>"Aarav had 5 ml paracetamol at 8 this morning. Temperature was 100.2 F before."</p><a class="btn ghost small" href="${connectHref}">Connect Claude</a></div>`}
      </aside>
    </div>`;
}

export function landing({ error } = {}) {
  return page({
    title: 'KidLog: tell Claude, show your doctor',
    body: `<section class="hero">
      <h1>Tell Claude what happened. Show your doctor the timeline.</h1>
      <p class="lead">At 2 AM you describe the night to Claude in your own words. KidLog keeps it as a clean, dated record you can correct and hand to the paediatrician.</p>
      <form method="post" action="/spaces" class="row">
        <input type="text" name="name" placeholder="Family name (optional)" aria-label="Family name" style="max-width:260px">
        <button class="btn">Create my family timeline</button>
      </form>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <p class="lead" style="margin-top:10px;font-size:14.5px">No sign-up. You get a private link; keep it safe, because anyone with the link can open the timeline.</p>
    </section>
    <div class="grid3">
      <div class="card"><b>1. Connect Claude</b>Paste one link into Claude's connector settings.</div>
      <div class="card"><b>2. Just talk</b>"Aarav woke up coughing at 2:15, felt warm, refused his bottle."</div>
      <div class="card"><b>3. Review and share</b>Fix anything in the app, then send the doctor a read-only link.</div>
    </div>
    <p class="note">KidLog has no AI inside. Your own Claude does the writing; KidLog only saves, shows and shares.</p>`,
  });
}

export function timeline({ space, all, entries, children, child, flagged, range, stamp, welcome }) {
  const base = `/f/${esc(space.key)}`;
  return page({
    title: `${space.name} · KidLog`,
    nav: spaceNav(space, 'timeline', switcher({ children, shown: pickShown(children, child), hrefFor: (c) => base + qs(c, flagged, range), manageHref: `${base}/kids` })),
    wide: true,
    body: `${welcome ? `<p class="note" style="margin-top:20px">Your timeline is ready. Bookmark this page: this private link is how you get back in. Next, <a href="${base}/connect">connect Claude</a>.</p>` : ''}
      ${board({ space, base, all, entries, children, child, flagged, range, readOnly: false, shareHref: `${base}/share`, connectHref: `${base}/connect` })}
      <script>
      (function(){var s=${JSON.stringify(stamp)};setInterval(function(){
        if(document.hidden)return;
        fetch(${JSON.stringify(`/f/${space.key}/stamp`)}).then(function(r){return r.text()}).then(function(t){if(t&&t!==s)location.reload()}).catch(function(){});
      },4000)})();
      </script>`,
  });
}

export function entryForm({ space, entry, error, isNew, children }) {
  const base = `/f/${esc(space.key)}`;
  const e = entry;
  const opts = CATEGORIES.map((c) => `<option value="${c}"${e.category === c ? ' selected' : ''}>${LABEL[c]}</option>`).join('');
  return page({
    title: `${isNew ? 'Add' : 'Edit'} entry · KidLog`,
    nav: spaceNav(space, 'timeline'),
    body: `<h1>${isNew ? 'Add an entry' : 'Edit entry'}</h1>
      <p class="lead">${isNew ? 'Write it yourself, or tell Claude and it will appear on the timeline.' : e.source === 'claude' ? 'Claude wrote this from what you said. Change anything that is not right.' : 'Change anything that is not right.'}</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${isNew ? `${base}/entries` : `${base}/e/${e.id}`}">
        <div class="two">
          <div><label for="child">Child</label>${children.length
            ? `<select id="child" name="child" required>${!children.some((c) => c.child === e.child) ? `<option value="${esc(e.child)}" selected>${esc(e.child) || 'Choose a child'}</option>` : ''}${children.map((c) => `<option value="${esc(c.child)}"${c.child === e.child ? ' selected' : ''}>${esc(c.child)}</option>`).join('')}</select>`
            : `<input id="child" type="text" name="child" value="${esc(e.child)}" required maxlength="60" placeholder="First name">`}</div>
          <div><label for="when">Date and time</label><input id="when" type="datetime-local" name="occurred_at" value="${esc(e.occurred_at)}" required></div>
        </div>
        <div class="two">
          <div><label for="cat">Type</label><select id="cat" name="category">${opts}</select></div>
          <div><label for="temp">Temperature (optional)</label><input id="temp" type="text" name="temperature" value="${esc(e.temperature || '')}" placeholder="e.g. 100.4 F" maxlength="20"></div>
        </div>
        <label for="title">Summary</label><input id="title" type="text" name="title" value="${esc(e.title)}" required maxlength="120">
        <label for="details">Details</label><textarea id="details" name="details" maxlength="4000">${esc(e.details)}</textarea>
        <label class="check"><input type="checkbox" name="flagged"${e.flagged ? ' checked' : ''}> Raise this with the doctor</label>
        <div class="row" style="margin-top:22px">
          <button class="btn">${isNew ? 'Add to timeline' : 'Save changes'}</button>
          <a class="btn ghost" href="${base}">Cancel</a>
        </div>
      </form>
      ${isNew ? '' : `<form method="post" action="${base}/e/${e.id}/delete" style="margin-top:28px" onsubmit="return window.confirm('Delete this entry? This cannot be undone.')">
        <button class="btn danger small">Delete this entry</button></form>`}`,
  });
}

const copyBox = (id, value) => `<div class="copy"><input id="${id}" type="text" readonly value="${esc(value)}" aria-label="Link" onfocus="this.select()">
  <button type="button" class="btn" onclick="var i=document.getElementById('${id}');navigator.clipboard.writeText(i.value).then(()=>{this.textContent='Copied'})">Copy</button></div>`;

export function connect({ space, mcpUrl }) {
  return page({
    title: 'Connect Claude · KidLog',
    nav: spaceNav(space, 'connect'),
    body: `<h1>Connect Claude</h1>
      <p class="lead">One-time setup, about a minute. It works in Claude on the web, desktop and phone.</p>
      <h2>Your KidLog connection link</h2>
      ${copyBox('mcp', mcpUrl)}
      <p style="font-size:14.5px;color:var(--muted)">Treat this link like a password. Anyone who has it can add to and read this timeline.</p>
      <h2>Steps</h2>
      <ol class="steps">
        <li>Open <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener">Claude</a> and go to <b>Customize &gt; Connectors</b>.</li>
        <li>Click <b>Add</b>, then <b>Add custom connector</b> (on some plans: <b>Custom &gt; Web</b>).</li>
        <li>Name it <b>KidLog</b>, paste the link above as the server URL, and continue.</li>
        <li>If asked about authentication, choose <b>No sign in</b>, then click <b>Add</b>.</li>
        <li>In a new chat, make sure KidLog is switched on under the <b>+</b> menu &gt; <b>Connectors</b>.</li>
      </ol>
      <h2>Then try saying</h2>
      <div class="say">Aarav woke up coughing at 2:15 AM, felt a bit warm but no high fever. Refused his bottle, settled around 3. Log this for the doctor.</div>
      <div class="say">Gave Aarav 5 ml paracetamol at 8 this morning. Temperature was 100.2 F before.</div>
      <div class="say">Summarise Aarav's last two weeks for our doctor visit.</div>
      <p><a class="btn ghost" href="/f/${esc(space.key)}">Back to the timeline</a></p>`,
  });
}

export function share({ space, shareUrl }) {
  return page({
    title: 'Share with doctor · KidLog',
    nav: spaceNav(space, 'share'),
    body: `<h1>Share with your doctor</h1>
      <p class="lead">A read-only view of the timeline. The doctor can read and print it, and cannot change anything.</p>
      ${copyBox('share', shareUrl)}
      <p class="row" style="margin-top:14px"><a class="btn ghost" href="${esc(shareUrl)}" target="_blank" rel="noopener">Preview what the doctor sees</a></p>
      <p class="note">Entries you flagged "Raise with doctor" are highlighted so they stand out in a short appointment.</p>`,
  });
}

export function doctorView({ space, token, all, entries, children, child, flagged, range }) {
  return page({
    title: `${space.name} · health timeline`,
    nav: '<nav><a class="on">Read-only view for the doctor</a></nav>' + switcher({ children, shown: pickShown(children, child), hrefFor: (c) => `/d/${esc(token)}` + qs(c, flagged, range) }),
    wide: true,
    body: board({ space, base: `/d/${esc(token)}`, all, entries, children, child, flagged, range, readOnly: true }),
  });
}

export function kids({ space, children, error, draft = {} }) {
  const base = `/f/${esc(space.key)}`;
  const rows = children.map((c) => `<div class="kid">
      <span class="mini big">${initial(c.child)}</span>
      <div class="kinfo"><b>${esc(c.child)}</b><span>${c.dob ? esc(ageLabel(c.dob)) : 'Birth date not set'} · ${c.entries} ${c.entries === 1 ? 'entry' : 'entries'}</span></div>
      <a class="btn ghost small" href="${base}?child=${encodeURIComponent(c.child)}">Open timeline</a>
      <a class="btn ghost small" href="${base}/kids/${c.id}">Edit</a>
    </div>`).join('');
  return page({
    title: 'Children · KidLog',
    nav: spaceNav(space, 'kids'),
    body: `<h1>Children</h1>
      <p class="lead">Each child has their own timeline. A child is also added automatically the first time you tell Claude about them.</p>
      ${rows || '<div class="card empty">No children yet. Add your first below.</div>'}
      <h2>Add a child</h2>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${base}/kids" class="card">
        <div class="two">
          <div><label for="name" style="margin-top:0">First name</label><input id="name" type="text" name="name" value="${esc(draft.name || '')}" required maxlength="60"></div>
          <div><label for="dob" style="margin-top:0">Birth date (optional)</label><input id="dob" type="date" name="dob" value="${esc(draft.dob || '')}"></div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn">Add child</button></div>
      </form>`,
  });
}

export function kidForm({ space, kid, error }) {
  const base = `/f/${esc(space.key)}`;
  return page({
    title: `Edit ${kid.child} · KidLog`,
    nav: spaceNav(space, 'kids'),
    body: `<h1>Edit ${esc(kid.child)}</h1>
      <p class="lead">The birth date is used to show age on the timeline and in the doctor's view.</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${base}/kids/${kid.id}">
        <div class="two">
          <div><label for="name">First name</label><input id="name" type="text" name="name" value="${esc(kid.child)}" required maxlength="60"></div>
          <div><label for="dob">Birth date</label><input id="dob" type="date" name="dob" value="${esc(kid.dob || '')}"></div>
        </div>
        <div class="row" style="margin-top:22px"><button class="btn">Save changes</button><a class="btn ghost" href="${base}/kids">Cancel</a></div>
      </form>
      ${kid.entries ? `<p class="lead" style="margin-top:24px;font-size:14.5px">Renaming also renames ${kid.entries} ${kid.entries === 1 ? 'entry' : 'entries'}. Renaming to another child's name merges the two.</p>`
        : `<form method="post" action="${base}/kids/${kid.id}/delete" style="margin-top:28px"><button class="btn danger small">Remove this child</button></form>`}`,
  });
}

export function notFound(message) {
  return page({
    title: 'Not found · KidLog',
    body: `<h1>We could not find that page</h1><p class="lead">${esc(message || 'Check the link and try again.')}</p><p><a class="btn" href="/">Go to KidLog</a></p>`,
  });
}
