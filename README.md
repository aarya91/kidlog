# KidLog

Tell Claude what happened with your child; KidLog keeps it as a dated health timeline you can edit and share with the doctor.

**No AI inside.** There are no AI keys or AI calls anywhere in this code. The customer's own Claude does the reading and writing through MCP. KidLog only saves, shows, edits and shares.

## What it does

| Part | Where |
|---|---|
| Claude connection (MCP) | `POST /mcp/<family key>` with tools `log_event`, `get_timeline`, `update_event`, `list_children`, `save_child_profile` |
| Family timeline (view, edit, flag, delete, add) | `/f/<family key>` |
| Child profiles (name, birth date, switcher) | `/f/<family key>/kids` |
| Read-only doctor view | `/d/<share token>` |
| Setup page with the MCP link and steps | `/f/<family key>/connect` |

There are no passwords. Each family gets a private link; anyone with the link can open that timeline.

## Put it live (Vercel + free Postgres, about 10 minutes)

1. Create a free account at github.com and make a new empty repository called `kidlog`.
2. On the repository page choose **uploading an existing file**, drag in everything from this folder (including the `api` folder), and commit.
3. Create a free account at vercel.com using **Continue with GitHub**.
4. Click **Add New > Project**, pick the `kidlog` repository, and click **Deploy**. Leave all settings as they are.
5. In the project, open the **Storage** tab, create a **Neon Postgres** database (free plan) and connect it to the project. This adds `DATABASE_URL` for you.
6. Open **Deployments**, click the latest one, and choose **Redeploy** so it picks up the database.
7. Open your site address (it looks like `https://kidlog-xxxx.vercel.app`). Tables are created automatically on first use.

Alternative host: Render. Choose **New > Blueprint**, pick the repository, and it reads `render.yaml`. The free plan sleeps when idle, so the first request can take about a minute.

## Connect it to Claude

1. Open the live site and click **Create my family timeline**.
2. Open **Connect Claude** and copy the connection link (`https://<your site>/mcp/<key>`).
3. In Claude go to **Customize > Connectors**, click **Add**, then **Add custom connector**.
4. Name it `KidLog`, paste the link as the server URL, choose **No sign in** if asked, and click **Add**.
5. In a new chat, switch KidLog on under **+ > Connectors**, then say:
   "Aarav woke up coughing at 2:15 AM, felt a bit warm but no high fever. Refused his bottle, settled around 3. Log this for the doctor."

## Run it on your own computer

```
npm install
DATABASE_URL=postgres://user:password@localhost:5432/kidlog npm start
```

Then open http://localhost:3000.

## Files

- `app.js` routes for the web pages
- `mcp.js` the Claude connection and its five tools
- `db.js` Postgres tables and queries
- `views.js` the HTML pages
- `server.js` starts the app on a normal host; `api/index.js` and `vercel.json` do the same on Vercel
