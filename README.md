# KidLog

**Tell Claude what happened. Show your doctor the timeline.**

KidLog keeps a dated health record for each of your children. You describe what happened to Claude in your own words, and it appears on a timeline you can correct, add appointments to, and share with the doctor as a read-only link.

KidLog has no AI inside. Your own Claude does the reading and writing; KidLog only saves, shows and shares. It records what you say and never gives medical advice.

![A child's health timeline in KidLog](docs/screenshots/timeline.png)

---

# Using KidLog

## What you need

- A Claude account on a plan that allows custom connectors.
- The KidLog site: **https://kidlog-alpha.vercel.app**

## Set it up (about 3 minutes)

### 1. Create your family timeline

Open the KidLog site, type a family name if you like, and click **Create my family timeline**.

There is no sign-up and no password. You get a private link to your timeline. **Bookmark it**: that link is how you get back in, and anyone who has it can open your timeline.

![The KidLog home page](docs/screenshots/home.png)

### 2. Connect Claude

In KidLog, open **Connect Claude** and copy your connection link. It looks like `https://kidlog-alpha.vercel.app/mcp/…` and is different for every family.


Then in Claude:

1. Go to **Customize > Connectors**.
2. Click **Add**, then **Add custom connector**.
3. Name it `KidLog` and paste your connection link as the server URL.
4. If asked about authentication, choose **No sign in**, then click **Add**.
5. In a new chat, open the **+** menu, choose **Connectors**, and make sure KidLog is switched on.

Treat the connection link like a password. Anyone who has it can read and add to your timeline.

### 3. Tell Claude what happened

In a chat with KidLog switched on, say it the way you would tell a friend:

> Vedant woke up coughing at 2:15 last night, felt a bit warm but no high fever. Refused his milk and settled around 3. Log this, I want to raise it with the doctor.

Claude saves it as a dated entry, and it appears on the timeline within a few seconds. A child is added automatically the first time you mention them.

## What you can say to Claude

| You want to | Say something like |
|---|---|
| Add your children | "Add my kids to KidLog. Vedant was born on 14 August 2024 and Jay on 22 June 2022." |
| Log a symptom | "Jay had a stomach ache at 7:30 this morning, no fever. Fine by 9." |
| Log medicine and temperature | "Gave Vedant 5 ml paracetamol at 8 AM. Temperature was 100.2 F before." |
| Log a doctor visit or vaccine | "Vedant had his check-up on 3 November. Weight 12.4 kg, height 88 cm." |
| Flag something for the doctor | End with "I want to raise this with the doctor." |
| Correct an entry | "Actually the cough started at 1:30, not 2:15." |
| Add an appointment | "Jay has a follow-up with the paediatrician on 28 January at 5 PM." |
| Prepare for a visit | "Summarise Vedant's last two weeks for the doctor." |

## Using the app

### Edit anything Claude wrote

Every entry has an **Edit entry** button. Change the time, the wording, the temperature or the type, or tick **Raise this with the doctor**. You can also add entries by hand with **Add an entry**.

![Editing an entry](docs/screenshots/edit.png)

### See one child at a time

Use the buttons above the timeline (**All children**, then one per child) or the switcher at the top right. **Flagged only** shows just the entries marked for the doctor, and the period menu narrows the list to the last 7, 30 or 90 days.

Manage names and birth dates on the **Children** page. The birth date is used to show the child's age.

![The Children page](docs/screenshots/children.png)

### Keep appointments in view

The **Upcoming** card on the right of the timeline shows the next doctor or vaccine appointment for the child you are viewing. Click **Add appointment** to add as many as you need, or **See all** for the full list.

![The appointments list](docs/screenshots/appointments.png)

### Share with your doctor

Open **Share with doctor**, choose whose timeline and what to include, and click **Create link**.

- **Whose timeline:** one child, or all children.
- **What to include:** the entire list, or only entries flagged for the doctor.

![Creating a share link](docs/screenshots/share.png)

The doctor opens the link in any browser. They can read and print it, and cannot change anything. A link for one child never shows another child's entries.

![What the doctor sees](docs/screenshots/doctor-view.png)

Every link you create is listed on the same page with a **Turn off** button. A link that is turned off stops working straight away.

## Good to know

- **Privacy:** there are no accounts. Your timeline link and your Claude connection link act as passwords, so share them only with people who should see the timeline. Share links for doctors are separate and read-only.
- **Not medical advice:** KidLog stores what you tell it. It does not diagnose, rate urgency or suggest treatment. If you are worried about your child, contact your doctor.
- **Works on your phone:** the connector works in Claude on the web, desktop and mobile, and the KidLog site works in any browser.

## If something isn't working

| Problem | What to do |
|---|---|
| Claude doesn't offer to save anything | Check that KidLog is switched on under **+ > Connectors** in that chat. |
| Claude can log entries but not appointments | Remove the KidLog connector in Claude and add it again with the same link, so it picks up the newest actions. |
| The entry doesn't appear | Refresh the timeline, and check you are viewing the right child or **All children**. |
| "Unknown KidLog link" | The connection link was copied incompletely. Copy it again from the **Connect Claude** page. |
| I lost my timeline link | Ask Claude "what's my KidLog timeline link?" in a chat with KidLog switched on; it is included with every saved entry. |

---

# For developers

## How it works

```
Parent types in Claude  ──►  Claude calls a KidLog tool over MCP  ──►  KidLog saves a row in Postgres
                                                                              │
Doctor opens a read-only link  ◄──  Parent edits, flags and shares in the web app
```

One small Node.js service serves both the web pages and the MCP endpoint. There are no AI keys, AI libraries or AI calls anywhere in this code.

| Piece | Choice |
|---|---|
| Runtime | Node.js 20 or newer, Express 5 |
| Storage | Postgres (tables are created automatically on first request) |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP, stateless (a fresh server per request, so it runs on serverless hosts) |
| Pages | Server-rendered HTML with inline CSS; no front-end framework or build step |
| Access | No accounts. Unguessable random keys in the URL: one per family, one per share link |

## MCP tools

Endpoint: `POST /mcp/<family key>`

| Tool | What it does |
|---|---|
| `log_event` | Save one event (symptom, temperature, medicine, feeding, sleep, doctor visit, vaccine, note) |
| `get_timeline` | Read entries, with optional child, date range and flagged-only filters |
| `update_event` | Correct fields of an existing entry |
| `list_children` | List children with birth date, age and entry counts |
| `save_child_profile` | Add a child or set a birth date |
| `add_appointment` | Save an upcoming doctor or vaccine appointment |
| `list_appointments` | List appointments, soonest first |

The server's instructions tell Claude to record only what the parent said, to add no clinical wording or severity, and never to guess a birth date.

## Web routes

| Route | Purpose |
|---|---|
| `/` | Home page; `POST /spaces` creates a family |
| `/f/<key>` | Timeline (query: `child`, `flagged=1`, `range=7|30|90`) |
| `/f/<key>/e/<id>` | Edit an entry; `/new` adds one |
| `/f/<key>/kids` | Child profiles |
| `/f/<key>/appointments` | Appointments list, add and edit |
| `/f/<key>/share` | Create and turn off doctor share links |
| `/f/<key>/connect` | The MCP link and setup steps |
| `/d/<token>` | Read-only doctor view, locked to the link's child and flagged-only setting |
| `/healthz` | Returns `ok` when the database is reachable |

## Data model

| Table | Holds |
|---|---|
| `spaces` | One row per family: private key, name |
| `children` | Name and birth date, unique per family |
| `entries` | Health events: child, time, category, title, details, temperature, flag, source |
| `appointments` | Upcoming visits: child, type, time, title, notes |
| `shares` | Doctor links: token, child (or all), flagged-only setting |

Dates and times are stored as local text (`YYYY-MM-DDTHH:MM`) exactly as the parent gave them, with no timezone conversion.

## Run it locally

```
npm install
DATABASE_URL=postgres://user:password@localhost:5432/kidlog npm start
```

Then open http://localhost:3000.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (`POSTGRES_URL` is also accepted) |
| `PORT` | No | Port to listen on; defaults to 3000 |
| `PUBLIC_URL` | No | Public address used in generated links; defaults to the request's host |

## Deploy

**Vercel with Neon Postgres**

1. Push this repository to GitHub.
2. In Vercel, choose **Add New > Project**, import the repository, and deploy with the default settings.
3. In the project's **Storage** tab, create a **Neon** Postgres database and connect it. This sets `DATABASE_URL`.
4. Redeploy, then open `/healthz` on your site to confirm it shows `ok`.

`vercel.json` routes every request to `api/index.js`, which exports the Express app.

**Render:** choose **New > Blueprint** and pick the repository; `render.yaml` creates the web service and database. The free plan sleeps when idle.

## Project files

| File | Contents |
|---|---|
| `app.js` | Express routes for all pages |
| `mcp.js` | The MCP endpoint, tool definitions and instructions to Claude |
| `db.js` | Tables, queries and input validation |
| `views.js` | HTML pages and CSS |
| `server.js` | Starts the app on a normal host |
| `api/index.js`, `vercel.json` | Entry point and routing for Vercel |
| `render.yaml` | Blueprint for Render |
| `docs/screenshots/` | Images used in this README |
