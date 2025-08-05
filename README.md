# Zoom Meeting Bot with Realtime Transcripts & Post-Call Recordings (Recall.ai)

This app sends a Recall.ai bot into a Zoom call, streams real-time transcripts to the browser, and—when the call ends—fetches the final **MP4 video**, **MP3 audio**, and **full transcript**, then displays download links as well as players for the audio and video in the web app.

**Stack:** Next.js API routes, Prisma + PostgreSQL, a tiny Node WebSocket relay, ngrok (static domain), Recall.ai Meeting Bot API.

**Live features:** Real-time `transcript.data` → Webhook → WS → Browser.  
**Post-call features:** Handle `bot.status_change` (`call_ended` / `done`) → resolve `recording_id` → fetch media & transcript → persist → UI polling shows links.

## 1) Prerequisites

### Accounts & API keys
- A Recall.ai workspace + API key (free to start). Create a workspace and generate an API key in the dashboard.  
  - [Recall.ai](https://www.recall.ai?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- A static domain (ngrok is what we use here). For instructions see the [ngrok section](https://github.com/recallai/recall-ai-zoom-transcripts-and-recording-sample/blob/main/README.md#ngrok-static-domain-required) in the appendix.


    
> Store the API key somewhere safe (you'll need to add it to your .env file later)

### Software

- **Node.js LTS** (18+ recommended)  
  - macOS: `brew install node` (or use Node installer)  
  - Windows: install from https://nodejs.org or `choco install nodejs-lts`

- **PostgreSQL** (14+)  
  - macOS: `brew install postgresql@16 && brew services start postgresql@16`  
  - Windows: use the official installer or `choco install postgresql`

- **ngrok** (with a reserved/static domain)  
  - macOS: `brew install ngrok/ngrok/ngrok`  
  - Windows: download installer or `choco install ngrok`

- **pnpm** (optional but recommended): `npm i -g pnpm`

- **TypeScript & Type Definitions**  
  Already included in `devDependencies`, but if you're setting up manually:

```bash
  pnpm add -D typescript ts-node @types/node @types/express @types/ws @types/react @types/react-dom
```

> You can swap `brew`/`choco` for GUI installers if you prefer.


### Ensure PostgreSQL is running and initialized

After installing PostgreSQL, make sure it's running and that the target database exists.

```bash
# Start PostgreSQL (macOS)
brew services start postgresql@16

# Create the database manually if it doesn't exist yet
createdb recall_demo
```

> On Windows, you can use `pgAdmin` or the command line to ensure the `recall_demo` database exists.

## 2) Clone & install

```bash
git clone <this-repo>
cd <this-repo>
```
### install deps
npm install
 or
pnpm install

## 3) Configure environment

Create a `.env` file in the project root. Copy the following into the `.env` file:

```bash
# .env
# Postgres: adjust user, password, db name as needed
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/recall_demo?schema=public"

# Recall: IMPORTANT — raw key, no “Bearer ”
RECALL_API_KEY="<YOUR_RECALL_API_KEY>"
```

**Run Prisma** (only after PostgreSQL is running and the database exists): 

```bash
npx prisma generate
# This applies the DB schema and seeds the database
npx prisma migrate dev -n init
```

## 4) Set up ngrok (static domain)

Create or edit `~/.config/ngrok/ngrok.yml` (macOS/Linux) or `%UserProfile%\.config\ngrok\ngrok.yml` 

> If `~/.config/ngrok/ngrok.yml` doesn’t exist, just create it manually.

(Windows):

```yaml
version: 2
authtoken: <YOUR_NGROK_AUTHTOKEN>

tunnels:
  web:
    proto: http
    addr: 3000
    domain: <your-static-domain>.ngrok-free.app
  # (optional) expose WS relay too if you don’t proxy it via Next
  ws:
    proto: http
    addr: 4000
    domain: <your-static-ws-domain>.ngrok-free.app
```

You’ll reference https://<your-static-domain>.ngrok-free.app as the public base URL for webhooks.

## 5) Project files (what does what)

- **`pages/api/startRecall.ts`** — creates the bot with:
  - `meeting_url` (your Zoom link),
  - `webhook_url: "https://<ngrok-domain>/api/webhook"`,
  - `recording_config.realtime_endpoints` for real-time transcripts.  
  Docs: [Real-time Webhook Endpoints](https://docs.recall.ai/docs/real-time-webhook-endpoints?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

- **`pages/api/webhook.ts`** — ACKs fast, handles:
  - `transcript.data` → save + broadcast to WS,
  - `bot.status_change` → on `call_ended`/`done` resolve `recording_id` and fetch media/transcripts,
  Docs: [Real-time Webhook Endpoints](https://docs.recall.ai/docs/real-time-webhook-endpoints?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall), [Bot status change events](https://docs.recall.ai/docs/bot-status-change-events?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

- **`lib/recall-media.ts`** — calls Recall API:
  - `GET /bot/{id}` until `recordings[]` appears,
  - prefers `media_shortcuts` (direct download URLs),
  - falls back to `video_mixed` / `audio_mixed`,
  - fetches full structured transcript.  
  Docs: [Bot status change events](https://docs.recall.ai/docs/bot-status-change-events?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall), [Mixed Audio](https://docs.recall.ai/docs/how-to-get-mixed-audio-async?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall), [Mixed Video](https://docs.recall.ai/reference/video_mixed_retrieve?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

- **`pages/api/userData.ts`** — returns latest meeting’s transcript + `videoUrl`/`audioUrl` for the UI poller.

- **`pages/api/manualRetrieve.ts`** — manual “fetch artifacts now” endpoint.

- **`ws-server.ts`** — tiny WebSocket relay `/recall` + `/send`.

- **`prisma/schema.prisma`** — schema for `Meeting` and `Transcript`.



## 6) Run the app (three terminals)
You’ll need to run three terminals side-by-side:

- **Terminal A:** Starts the Next.js web app (UI + API routes)
- **Terminal B:** Starts the WebSocket relay (real-time transcript updates)
- **Terminal C:** Starts ngrok to expose your local server to Recall’s webhook system


**Terminal A — Next.js**

```bash
npm run dev
# or
pnpm dev
```

**Terminal B --WebSocket relay**
```bash
# if compiled JS exists
node ws-server.js
# or run TypeScript directly
npx ts-node ws-server.ts
```

```bash
ngrok start --all
```

## 7) Use it (end-to-end)

1. Open a Zoom meeting you control (so you can admit the bot).
2. Visit the app at `http://localhost:3000` (or via your ngrok domain).
3. Paste the Zoom link and click **Start Bot**.  

   – `startRecall.ts` creates the bot and stores `{ externalId, botId }`.
4. Admit the bot in the Zoom UI.
5. Talk for a bit — you’ll see transcript lines appear in real time.  

   – Those are `transcript.data` webhook events → DB → WS → browser.  
   Docs: https://docs.recall.ai
6. End the call — watch server logs:  

   – You’ll see `bot.status_change` with `code: call_ended` then `code: done`.  
   Docs: https://docs.recall.ai
7. The server resolves `recording_id` and fetches:

   - **MP4** (mixed video),
   - **MP3** (mixed audio),
   - **full structured transcript**.  
   Docs: [Bot status change events](https://docs.recall.ai/docs/bot-status-change-events?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall), [Mixed Audio](https://docs.recall.ai/docs/how-to-get-mixed-audio-async?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall), [Transcription](https://docs.recall.ai/docs/bot-transcription?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
8. Wait 5–10s — the UI polls `/api/userData`; **Video** and **Audio** links appear.
9. *(Optional)* Click **Get Async Transcript & Video** to force retrieval.

<br>
<br>

## Appendix

### Inspect saved data in PostgreSQL (Optional)

Once your app is running and has received a real-time transcript or finished a call, you can inspect the saved data in Postgres directly.

#### Connect to Postgres

Use the `psql` CLI to open a connection to your local Postgres instance:

```bash
psql -h localhost -U postgres -d recall_ai_dev
```

- `-h localhost`: Connect to local DB server  
- `-U postgres`: Use the default Postgres user  
- `-d recall_ai_dev`: Use the same DB as in `.env` (`DATABASE_URL`)  

If prompted for a password, use the one configured for your local Postgres setup (e.g. `postgres` by default if unchanged).


#### List all tables

```sql
\dt
```
This will show all tables — you should see "Meeting" and "Transcript" if migrations ran correctly.

#### View recent meetings

```sql
SELECT * FROM "Meeting" ORDER BY "createdAt" DESC LIMIT 5;
```

This will show the latest meetings. Useful columns to check:

- `externalId`: Used to track Recall bot sessions  
- `meetingUrl`: The original Zoom link  
- `botId`, `recordingId`: Populated once the call ends  
- `createdAt`: When the meeting entry was saved  


#### View transcripts for a meeting

First, find the `id` of the meeting you want to inspect (from the `"Meeting"` table), then run:

```sql
SELECT * FROM "Transcript" WHERE "meetingId" = '<YOUR_MEETING_ID>' ORDER BY "timestamp" ASC;
```
This shows all transcript lines tied to that meeting. You’ll see:

- `text`: What was said  
- `speaker`: Who said it (if available)  
- `timestamp`: When it was spoken  


#### Exit Postgres CLI

Type `\q` and press Enter to quit the Postgres session.


You can use this to confirm that:

- Real-time transcripts are being saved correctly  
- Post-call artifacts like `videoUrl`, `audioUrl`, and `recordingId` are being set after `bot.status_change` events


### Configuration notes

- **Authorization header** must be the raw key *(no “Bearer ”)*:
Authorization: $RECALLAI_API_KEY
- [Authentication](https://docs.recall.ai/reference/authentication?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

- **Webhooks**
- Real-time transcript is configured in `recording_config.realtime_endpoints` and hits your `/api/webhook`.  
  Docs: [Real-time WebSocket](https://docs.recall.ai/docs/real-time-websocket-endpoints?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- Bot status change webhooks are delivered via Svix; you can receive them at the `webhook_url` you pass when creating the bot or configure endpoints in your dashboard.  
  Docs: [Svix](https://docs.recall.ai/docs/faq-webhooks?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

- **Artifacts availability**
- After `done`, `GET /bot/{BOT_ID}` will include `recordings[]`. Use that `recording_id` to fetch media or read `media_shortcuts`.  
  Docs: https://docs.recall.ai


### Troubleshooting

**No transcripts?**  
Ensure you enabled transcription when creating the bot:

```json
"recording_config": {
"transcript": { "provider": { "meeting_captions": {} } },
"realtime_endpoints": [
  {
    "type": "webhook",
    "url": "https://<your-ngrok-domain>/api/webhook",
    "events": ["transcript.data", "transcript.partial_data"]
  }
]
}
```

#### Real-time transcription

- **Real-time transcription must be explicitly enabled.** 


#### No media links after call ends?

- Check server logs around `bot.status_change → done`.
- Confirm your `RECALL_API_KEY` and that the `Authorization` header **does not** include “Bearer”.
- Verify `/api/webhook` is publicly reachable at your ngrok domain.



#### WS relay not connecting through ngrok?

- Either expose port **4000** with a second ngrok tunnel, **or**
- Proxy `/recall` through Next.js so the browser connects to the same domain.



#### 401 from Recall API?

- Wrong header or region. Check the header and base URL (e.g., `us-east-1`).  
  Docs: [Errors](https://docs.recall.ai/reference/errors?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)


#### ngrok (Static Domain Required)

To receive webhook events from Recall.ai, your app must be accessible via a **public, static domain**. This requires:

- A **free ngrok account**
- A **reserved (static) domain**

##### 1. Install ngrok

**macOS:**
```bash
brew install ngrok/ngrok/ngrok
```

**Windows:**
```bash
choco install ngrok
```
##### 2. Authenticate ngrok
Grab you auth token from the ngrok dashboard then run: 
```bash
ngrok config add-authtoken <YOUR_AUTHTOKEN>
```

##### 3. Reserve a static domain

1. Go to the ngrok Reserved Domains dashboard
2. Click "+ Reserve Domain"
3. Choose something like:
```bash
zoom-bot.ngrok-free.app
```
You’ll use this domain when configuring webhooks and writing your ngrok.yml (see Step 4 in the README).

> A static domain ensures Recall.ai can consistently reach your app with real-time events.

### Demo flow (for a quick video)

1. Three terminals: `npm run dev`, `ts-node ws-server.ts`, `ngrok start --all`.
2. Show `.env` with `DATABASE_URL` and `RECALL_API_KEY` (no “Bearer ”).
3. Open Zoom meeting.
4. In the app: paste Zoom link → **Start Bot**.
5. Admit bot in Zoom; speak → see real-time transcript appear.
6. End call → watch `bot.status_change` logs → links appear → click **MP4/MP3**.

[Demo](https://www.loom.com/share/cd2c1024fd894463be5a2e5890603904?sid=9718618e-c6f9-45e4-872b-f3630c37b7b8)


### Links

**Get started & docs (Recall.ai):** home page, Quickstart, Authentication  

- [Recall.ai](https://www.recall.ai?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- [Quickstart](https://docs.recall.ai/docs/quickstart?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- [Authentication](https://docs.recall.ai/reference/authentication?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- [Getting Started](https://docs.recall.ai/docs/getting-started?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

**Status & recording webhooks, Real-time transcript webhooks**

- [Real-time Webhooks](https://docs.recall.ai/docs/real-time-webhook-endpoints?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- [Bot Status Change Events](https://docs.recall.ai/docs/bot-status-change-events?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)

**Fetching recordings/transcripts**  

- [Retrieve Recordings](https://docs.recall.ai/reference/recording_retrieve?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
- [Retrieve Transcripts](https://docs.recall.ai/reference/transcript_retrieve?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-recall)
