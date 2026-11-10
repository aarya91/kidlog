// KidLog web app + Claude connection in one Express app.
import express from 'express';
import * as db from './db.js';
import * as views from './views.js';
import { handleMcp } from './mcp.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use((req, res, next) => {
  res.set('Referrer-Policy', 'no-referrer'); // private links must not leak to other sites
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  next();
});

const baseUrl = (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const RANGE_DAYS = { 7: 7, 30: 30, 90: 90 };
// Loads everything for the board, then narrows by period and flag in memory.
async function boardData(spaceId, query) {
  const child = db.clean(query.child, 60);
  const flagged = query.flagged === '1';
  const range = RANGE_DAYS[query.range] ? String(query.range) : 'all';
  const [all, children] = await Promise.all([db.listEntries(spaceId, { child }), db.listChildren(spaceId)]);
  let entries = all;
  if (range !== 'all') {
    // One spare day so "today" in any timezone is always included.
    const cutoff = new Date(Date.now() - (RANGE_DAYS[range] + 1) * 86400000).toISOString().slice(0, 16);
    entries = entries.filter((e) => e.occurred_at >= cutoff);
  }
  if (flagged) entries = entries.filter((e) => e.flagged);
  return { all, entries, children, child, flagged, range };
}

// ---- Claude connection (MCP) ----
app.all('/mcp/:key', (req, res) => handleMcp(req, res, baseUrl(req)));

// ---- Public pages ----
app.get('/', (req, res) => res.send(views.landing()));
app.get('/healthz', wrap(async (req, res) => { await db.init(); res.send('ok'); }));

app.post('/spaces', wrap(async (req, res) => {
  const space = await db.createSpace(req.body?.name);
  res.redirect(303, `/f/${space.key}?welcome=1`);
}));

// ---- Family space ----
const withSpace = wrap(async (req, res, next) => {
  const space = await db.spaceByKey(req.params.key);
  if (!space) return res.status(404).send(views.notFound('This timeline link is not valid.'));
  req.space = space;
  next();
});

app.get('/f/:key', withSpace, wrap(async (req, res) => {
  const [data, stamp] = await Promise.all([boardData(req.space.id, req.query), db.stamp(req.space.id)]);
  res.send(views.timeline({ space: req.space, ...data, stamp, welcome: req.query.welcome === '1' }));
}));

app.get('/f/:key/stamp', withSpace, wrap(async (req, res) => res.type('text').send(await db.stamp(req.space.id))));

app.get('/f/:key/connect', withSpace, (req, res) =>
  res.send(views.connect({ space: req.space, mcpUrl: `${baseUrl(req)}/mcp/${req.space.key}` })));

app.get('/f/:key/share', withSpace, (req, res) =>
  res.send(views.share({ space: req.space, shareUrl: `${baseUrl(req)}/d/${req.space.share_token}` })));

// ---- Child profiles ----
app.get('/f/:key/kids', withSpace, wrap(async (req, res) =>
  res.send(views.kids({ space: req.space, children: await db.listChildren(req.space.id) }))));

app.post('/f/:key/kids', withSpace, wrap(async (req, res) => {
  const dob = db.validateDob(req.body.dob);
  const r = dob.error ? dob : await db.saveChild(req.space.id, { name: req.body.name, dob: dob.value ?? undefined });
  if (r.error) return res.status(400).send(views.kids({ space: req.space, children: await db.listChildren(req.space.id), error: r.error, draft: req.body }));
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(r.value)}`);
}));

app.get('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  res.send(views.kidForm({ space: req.space, kid }));
}));

app.post('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  const dob = db.validateDob(req.body.dob);
  const r = dob.error ? dob : await db.saveChild(req.space.id, { id: kid.id, name: req.body.name, dob: dob.value });
  if (r.error) return res.status(400).send(views.kidForm({ space: req.space, kid: { ...kid, child: req.body.name ?? kid.child, dob: req.body.dob ?? kid.dob }, error: r.error }));
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(r.value)}`);
}));

app.post('/f/:key/kids/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteChild(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}/kids`);
}));

app.get('/f/:key/new', withSpace, wrap(async (req, res) => {
  const children = await db.listChildren(req.space.id);
  const picked = children.find((c) => c.child.toLowerCase() === db.clean(req.query.child, 60).toLowerCase());
  const entry = { child: picked ? picked.child : children.length === 1 ? children[0].child : '', occurred_at: '', category: 'symptom', title: '', details: '', temperature: '', flagged: false };
  res.send(views.entryForm({ space: req.space, entry, isNew: true, children }));
}));

app.post('/f/:key/entries', withSpace, wrap(async (req, res) => {
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  const v = db.validateEntry(body);
  if (v.error) {
    const children = await db.listChildren(req.space.id);
    return res.status(400).send(views.entryForm({ space: req.space, entry: { ...body, occurred_at: db.normaliseWhen(body.occurred_at) || '' }, error: v.error, isNew: true, children }));
  }
  await db.addEntry(req.space.id, v.value, 'manual');
  res.redirect(303, `/f/${req.space.key}`);
}));

app.get('/f/:key/e/:id', withSpace, wrap(async (req, res) => {
  const entry = await db.getEntry(req.space.id, req.params.id);
  if (!entry) return res.status(404).send(views.notFound('That entry no longer exists.'));
  res.send(views.entryForm({ space: req.space, entry, isNew: false, children: await db.listChildren(req.space.id) }));
}));

app.post('/f/:key/e/:id', withSpace, wrap(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (!existing) return res.status(404).send(views.notFound('That entry no longer exists.'));
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  const v = db.validateEntry(body);
  if (v.error) {
    return res.status(400).send(views.entryForm({
      space: req.space, entry: { ...existing, ...body, occurred_at: db.normaliseWhen(body.occurred_at) || existing.occurred_at },
      error: v.error, isNew: false, children: await db.listChildren(req.space.id),
    }));
  }
  await db.updateEntry(req.space.id, existing.id, v.value, { markEdited: true });
  res.redirect(303, `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/flag', withSpace, wrap(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (existing) await db.updateEntry(req.space.id, existing.id, { flagged: !existing.flagged });
  res.redirect(303, req.get('referer')?.startsWith(baseUrl(req)) ? req.get('referer') : `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteEntry(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}`);
}));

// ---- Read-only doctor view ----
app.get('/d/:token', wrap(async (req, res) => {
  const space = await db.spaceByShareToken(req.params.token);
  if (!space) return res.status(404).send(views.notFound('This share link is not valid.'));
  res.send(views.doctorView({ space, token: req.params.token, ...(await boardData(space.id, req.query)) }));
}));

app.use((req, res) => res.status(404).send(views.notFound()));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).send(views.notFound('Something went wrong on our side. Please try again.'));
});

export default app;
