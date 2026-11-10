// The Claude connection (MCP). Claude does the thinking; these tools only save and read rows.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as db from './db.js';

const INSTRUCTIONS = `KidLog keeps a parent's notes about their child's health as a timeline they can show a doctor.
You (the assistant) turn what the parent says into tidy entries; KidLog saves them and the parent can edit them later.

Rules for writing entries:
- Record only what the parent actually said. Keep their facts and plain wording. Do not add symptoms, clinical terms, causes or severity they did not state.
- Do not diagnose or rate urgency. If something sounds worrying, tell the parent in the chat to contact their doctor; do not write that judgement into the entry.
- If one message covers several distinct events (a fever, a medicine dose, a missed feed), save one entry per event.
- A child is added automatically the first time you log an event for them. Use save_child_profile when the parent tells you a birth date.
- When the parent mentions a future doctor or vaccine appointment, save it with add_appointment (not log_event, which is for things that already happened).
- Use the parent's local date and time. If they give no date, use today's date; if they give no time, use the current time.
- After saving, tell the parent briefly what was saved and give them the timeline link.`;

const when = z.string().describe("Local date and time of the event, formatted YYYY-MM-DDTHH:MM (24-hour), e.g. 2026-11-10T02:15");
const category = z.enum(db.CATEGORIES).describe('symptom, temperature, medicine, feeding, sleep, doctor_visit, vaccine, or note');

const shape = (e) => ({
  id: e.id,
  child: e.child,
  occurred_at: e.occurred_at,
  category: e.category,
  title: e.title,
  details: e.details,
  temperature: e.temperature,
  flagged_for_doctor: e.flagged,
  edited_by_parent: e.edited,
});

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

function buildServer(space, baseUrl) {
  const server = new McpServer({ name: 'kidlog', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const timelineUrl = `${baseUrl}/f/${space.key}`;

  server.registerTool('log_event', {
    title: 'Log a health event',
    description:
      "Save one event to a child's health timeline. Use the parent's own facts and wording, organised clearly. " +
      'Never add details, clinical language or severity the parent did not state.',
    inputSchema: {
      child_name: z.string().describe("The child's first name"),
      occurred_at: when,
      category,
      title: z.string().describe('Short plain summary, under 80 characters, e.g. "Woke up coughing, refused bottle"'),
      details: z.string().optional().describe("What happened, in the parent's words, as short lines. Only facts they stated."),
      temperature: z.string().optional().describe('Only if the parent gave a reading, with unit, e.g. "100.4 F" or "38 C"'),
      flag_for_doctor: z.boolean().optional().describe('True only if the parent says they want to raise this with the doctor'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (a) => {
    const v = db.validateEntry({
      child: a.child_name, occurred_at: a.occurred_at, category: a.category, title: a.title,
      details: a.details, temperature: a.temperature, flagged: a.flag_for_doctor,
    });
    if (v.error) return fail(v.error);
    const e = await db.addEntry(space.id, v.value, 'claude');
    return ok({ saved: shape(e), timeline_url: timelineUrl, edit_url: `${timelineUrl}/e/${e.id}` });
  });

  server.registerTool('get_timeline', {
    title: 'Read the timeline',
    description:
      "Read saved entries, newest first. Use this to answer questions about the child's history or to prepare a summary for a doctor visit. " +
      'Entries may have been edited by the parent in the app; treat the saved text as the source of truth.',
    inputSchema: {
      child_name: z.string().optional().describe('Only this child'),
      from: z.string().optional().describe('Start date, YYYY-MM-DD'),
      to: z.string().optional().describe('End date, YYYY-MM-DD'),
      flagged_only: z.boolean().optional().describe('Only entries flagged for the doctor'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => {
    const from = a.from ? db.normaliseWhen(a.from) : undefined;
    const toDay = a.to ? db.normaliseWhen(a.to) : undefined;
    if ((a.from && !from) || (a.to && !toDay)) return fail('Dates must look like 2026-11-10.');
    const entries = await db.listEntries(space.id, {
      child: a.child_name, from, to: toDay ? toDay.slice(0, 10) + 'T23:59' : undefined, flaggedOnly: a.flagged_only, limit: 200,
    });
    return ok({ count: entries.length, entries: entries.map(shape), timeline_url: timelineUrl });
  });

  server.registerTool('update_event', {
    title: 'Correct an entry',
    description: 'Change fields of an existing entry when the parent corrects or adds to it. Only send the fields that change.',
    inputSchema: {
      id: z.number().int().describe('Entry id from log_event or get_timeline'),
      child_name: z.string().optional(),
      occurred_at: when.optional(),
      category: category.optional(),
      title: z.string().optional(),
      details: z.string().optional().describe('Full replacement text for the details'),
      temperature: z.string().optional(),
      flag_for_doctor: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => {
    const v = db.validateEntry({
      child: a.child_name, occurred_at: a.occurred_at, category: a.category, title: a.title,
      details: a.details, temperature: a.temperature, flagged: a.flag_for_doctor,
    }, { partial: true });
    if (v.error) return fail(v.error);
    const e = await db.updateEntry(space.id, a.id, v.value);
    if (!e) return fail(`No entry with id ${a.id}.`);
    return ok({ saved: shape(e), edit_url: `${timelineUrl}/e/${e.id}` });
  });

  const kids = async () => (await db.listChildren(space.id)).map((c) => ({
    child: c.child, birth_date: c.dob, age: db.ageLabel(c.dob) || null, entries: c.entries, latest_entry: c.latest,
  }));

  server.registerTool('list_children', {
    title: 'List children',
    description: 'List the children in this family with birth date, age and how many entries each has. Use it to match a name the parent mentions.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => ok({ children: await kids(), timeline_url: timelineUrl }));

  server.registerTool('save_child_profile', {
    title: 'Add a child or set a birth date',
    description:
      "Add a child to the family, or set the birth date of an existing child. Only use a birth date the parent actually gave; never guess one from an age.",
    inputSchema: {
      child_name: z.string().describe("The child's first name"),
      birth_date: z.string().optional().describe('Birth date as YYYY-MM-DD, only if the parent stated it'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => {
    const dob = a.birth_date === undefined ? { value: undefined } : db.validateDob(a.birth_date);
    if (dob.error) return fail(dob.error);
    const r = await db.saveChild(space.id, { name: a.child_name, dob: dob.value === null ? undefined : dob.value });
    if (r.error) return fail(r.error);
    return ok({ saved: (await kids()).find((c) => c.child === r.value), children_url: `${timelineUrl}/kids` });
  });

  const apptShape = (a) => ({ id: a.id, child: a.child, type: a.kind, scheduled_at: a.scheduled_at, title: a.title, notes: a.notes });

  server.registerTool('add_appointment', {
    title: 'Add an upcoming appointment',
    description:
      'Save a future doctor or vaccine appointment for a child. Use only the date, time and details the parent gave. ' +
      'For something that already happened, use log_event instead.',
    inputSchema: {
      child_name: z.string().describe("The child's first name"),
      type: z.enum(db.APPOINTMENT_KINDS).describe('doctor or vaccine'),
      scheduled_at: z.string().describe('Local date and time of the appointment, YYYY-MM-DDTHH:MM (24-hour), e.g. 2027-01-28T17:00'),
      title: z.string().optional().describe('Short label, e.g. "Paediatrician follow-up" or "MMR second dose"'),
      notes: z.string().optional().describe('Anything the parent wants to remember for it, e.g. clinic name or what to bring'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (a) => {
    const v = db.validateAppointment({ child: a.child_name, kind: a.type, scheduled_at: a.scheduled_at, title: a.title, notes: a.notes });
    if (v.error) return fail(v.error);
    const saved = await db.addAppointment(space.id, v.value, 'claude');
    return ok({ saved: apptShape(saved), appointments_url: `${timelineUrl}/appointments`, timeline_url: timelineUrl });
  });

  server.registerTool('list_appointments', {
    title: 'List appointments',
    description: 'List saved doctor and vaccine appointments, soonest first. By default only those from today onwards.',
    inputSchema: {
      child_name: z.string().optional().describe('Only this child'),
      include_past: z.boolean().optional().describe('Also include appointments that have already passed'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => {
    // One spare day so "today" in any timezone is always included.
    const from = a.include_past ? undefined : new Date(Date.now() - 86400000).toISOString().slice(0, 16);
    const rows = await db.listAppointments(space.id, { child: a.child_name, from });
    return ok({ count: rows.length, appointments: rows.map(apptShape), appointments_url: `${timelineUrl}/appointments` });
  });

  return server;
}

const rpcError = (res, status, message) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });

// Stateless: every request gets a fresh server, so it runs on serverless hosts too.
export async function handleMcp(req, res, baseUrl) {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return rpcError(res, 405, 'Method not allowed. Use POST.');
  }
  let space;
  try {
    space = await db.spaceByKey(req.params.key);
  } catch (e) {
    console.error(e);
    return rpcError(res, 500, 'Storage is unavailable.');
  }
  if (!space) return rpcError(res, 404, 'Unknown KidLog link. Copy the link again from your Connect Claude page.');

  const server = buildServer(space, baseUrl);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) rpcError(res, 500, 'Internal error.');
  }
}
