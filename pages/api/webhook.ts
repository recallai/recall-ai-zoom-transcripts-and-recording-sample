// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'
import {
  waitForRecordingId,
  fetchArtifacts,
  fetchStructuredTranscriptByRecording,
} from '../../lib/recall-media'

export const config = { api: { bodyParser: false } }

function readRaw(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function storeByRecordingId(recordingId: string, hint?: { externalId?: string; botId?: string }) {
  try {
    let meeting =
      (await prisma.meeting.findFirst({ where: { recordingId } })) ||
      (hint?.externalId ? await prisma.meeting.findUnique({ where: { externalId: hint.externalId } }) : null) ||
      (hint?.botId ? await prisma.meeting.findFirst({ where: { botId: hint.botId } }) : null)

    if (!meeting) {
      console.warn('storeByRecordingId: meeting not found', { recordingId, hint })
      return
    }

    // Persist recordingId if not saved
    if (!meeting.recordingId || meeting.recordingId === '') {
      meeting = await prisma.meeting.update({
        where: { id: meeting.id },
        data: { recordingId },
      })
    }

    const { videoUrl, audioUrl } = await fetchArtifacts(recordingId)

    if (videoUrl || audioUrl) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          videoUrl: videoUrl ?? undefined,
          audioUrl: audioUrl ?? undefined,
        },
      })
    }

    // Pull full structured transcript (post-call)
    const full = await fetchStructuredTranscriptByRecording(recordingId)
    if (Array.isArray(full)) {
      for (const entry of full) {
        const speaker = entry?.participant?.name ?? 'Unknown speaker'
        const words = entry?.words ?? []
        const text = words.map((w: any) => w.text).join(' ').trim()
        const timestamp = words[0]?.start_timestamp?.absolute ?? new Date().toISOString()
        if (!text) continue

        const dup = await prisma.transcript.findFirst({
          where: { meetingId: meeting.id, text, timestamp: new Date(timestamp) },
        })
        if (!dup) {
          await prisma.transcript.create({
            data: { meetingId: meeting.id, speaker, text, timestamp: new Date(timestamp) },
          })
        }
      }
    }

    console.log('storeByRecordingId: saved artifacts/transcript', {
      externalId: meeting.externalId,
      recordingId,
      hasVideo: !!videoUrl,
      hasAudio: !!audioUrl,
    })
  } catch (e) {
    console.error('storeByRecordingId error:', e)
  }
}

async function fetchAfterBotDone(botId: string, externalId?: string) {
  try {
    console.log('fetchAfterBotDone: waiting for recordingId', { botId, externalId })
    const recId = await waitForRecordingId(botId, 20)
    if (!recId) {
      console.warn('fetchAfterBotDone: no recordingId after retries', { botId })
      return
    }
    await storeByRecordingId(recId, { externalId, botId })
  } catch (e) {
    console.error('fetchAfterBotDone error:', e)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawStr = await readRaw(req)
  if (rawStr) console.log('Webhook payload (first 500):', rawStr.slice(0, 500).replace(/\s+/g, ' '))

  let ev: any
  try {
    ev = JSON.parse(rawStr || '{}')
  } catch {
    res.status(400).end('Invalid JSON')
    return
  }

  res.status(200).end('ok')

  setImmediate(async () => {
    try {
      const event = ev?.event as string | undefined
      console.log('Webhook event:', event)

      if (event === 'transcript.data') {
        const words = ev?.data?.data?.words ?? []
        const externalId = ev?.data?.bot?.metadata?.external_id
        if (!externalId || words.length === 0) {
          console.warn('transcript.data missing externalId or empty words')
          return
        }
        const text = words.map((w: any) => w.text).join(' ').trim()
        if (!text) return

        const speaker = ev?.data?.data?.participant?.name ?? 'Unknown speaker'
        const ts = words[0]?.start_timestamp?.absolute ?? new Date().toISOString()

        const meeting = await prisma.meeting.findUnique({ where: { externalId } })
        if (!meeting) {
          console.warn(`Meeting not found for externalId: ${externalId}`)
          return
        }

        const dup = await prisma.transcript.findFirst({ where: { meetingId: meeting.id, text } })
        if (!dup) {
          await prisma.transcript.create({
            data: { meetingId: meeting.id, text, speaker, timestamp: new Date(ts) },
          })
        }

        try {
          await fetch('http://localhost:4000/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              externalId,
              message: { type: 'transcript', payload: { text, speaker, timestamp: ts } },
            }),
          })
        } catch {
          console.warn('WebSocket server offline or unreachable')
        }
        return
      }

      if (event === 'transcript.partial_data') return

      if (event === 'recording.done' || event === 'transcript.done') {
        const recordingId: string | undefined = ev?.data?.recording?.id
        const botId: string | undefined = ev?.data?.bot?.id
        const externalId: string | undefined = ev?.data?.bot?.metadata?.external_id
        if (!recordingId) {
          console.warn(`${event}: missing recordingId`)
          return
        }
        await storeByRecordingId(recordingId, { externalId, botId })
        return
      }

      if (event === 'bot.status_change') {
        const botId: string | undefined = ev?.data?.bot_id
        const code: string | undefined = ev?.data?.status?.code
        const recIdFromStatus: string | undefined = ev?.data?.status?.recording_id

        console.log('bot.status_change:', { botId, code, recIdFromStatus })

        if (!botId) return

        // Save the recordingId if present (e.g., on "in_call_recording")
        if (recIdFromStatus && recIdFromStatus.length > 0) {
          const meeting = await prisma.meeting.findFirst({ where: { botId } })
          if (meeting && (!meeting.recordingId || meeting.recordingId === '')) {
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: { recordingId: recIdFromStatus },
            })
            console.log('Saved recordingId from status:', recIdFromStatus)
          }
        }

        // When the bot is done / call ended, fetch artifacts
        if (code === 'done' || code === 'call_ended') {
          const meeting = await prisma.meeting.findFirst({ where: { botId } })
          if (!meeting) {
            console.warn('No meeting for botId on done/call_ended', { botId })
            return
          }
          const recId = meeting.recordingId && meeting.recordingId !== '' ? meeting.recordingId : recIdFromStatus
          if (recId) {
            await storeByRecordingId(recId, { botId })
          } else {
            await fetchAfterBotDone(botId, meeting.externalId)
          }
        }

        return
      }
    } catch (err) {
      console.error('Webhook background handler error:', err)
    }
  })
}
