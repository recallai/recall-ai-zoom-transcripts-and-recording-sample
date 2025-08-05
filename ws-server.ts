// ws-server.ts
import http from 'http'
import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'
import url from 'url'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

type Client = { ws: WebSocket; externalId?: string }
const clients: Client[] = []

function broadcast(externalId: string, message: any) {
  const json = JSON.stringify(message)
  clients.forEach(c => {
    if (c.externalId === externalId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(json)
    }
  })
}

wss.on('connection', (ws, req) => {
  const q = url.parse(req.url || '', true).query
  const externalId = q.externalId?.toString()

  console.log(`WebSocket connected (${externalId})`)
  clients.push({ ws, externalId })

  ws.on('close', () => {
    const i = clients.findIndex(c => c.ws === ws)
    if (i !== -1) clients.splice(i, 1)
  })
})

// endpoint to push messages
app.use(express.json())
app.post('/send', (req, res) => {
  const { externalId, message } = req.body
  if (!externalId || !message) {
    res.status(400).json({ error: 'Missing externalId or message' })
    return
  }

  broadcast(externalId, message)
  res.json({ success: true })
})

const PORT = 4000
server.listen(PORT, () => {
  console.log(`WebSocket server listening on http://localhost:${PORT}`)
})
