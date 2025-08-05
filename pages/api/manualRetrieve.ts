// pages/api/manualRetrieve.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'
import {
  waitForRecordingId,
  fetchArtifacts,
  fetchStructuredTranscriptByRecording,
} from '../../lib/recall-media'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const externalId = req.query.externalId as string
  if (!externalId) return res.status(400).json({ error: 'Missing externalId' })

  const meeting = await prisma.meeting.findUnique({ where: { externalId } })
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' })

  try {
    let recordingId: string | null = meeting.recordingId || null
    if (!recordingId) {
      recordingId = await waitForRecordingId(meeting.botId, 20)
      if (recordingId) {
        await prisma.meeting.update({ where: { id: meeting.id }, data: { recordingId } })
      }
    }

    if (!recordingId) {
      return res.json({ videoUrl: null, audioUrl: null, success: false })
    }

    const { videoUrl, audioUrl } = await fetchArtifacts(recordingId)
    if (videoUrl || audioUrl) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { videoUrl: videoUrl ?? undefined, audioUrl: audioUrl ?? undefined },
      })
    }

    const transcript = await fetchStructuredTranscriptByRecording(recordingId)
    if (Array.isArray(transcript)) {
      for (const entry of transcript) {
        const speaker = entry?.participant?.name ?? 'Unknown speaker'
        const words = entry?.words ?? []
        const text = words.map((w: any) => w.text).join(' ').trim()
        const timestamp = words[0]?.start_timestamp?.absolute ?? new Date().toISOString()
        if (!text) continue

        const dup = await prisma.transcript.findFirst({
          where: { meetingId: meeting.id, text, timestamp: new Date(timestamp) },
        })
        if (dup) continue

        await prisma.transcript.create({
          data: { meetingId: meeting.id, speaker, text, timestamp: new Date(timestamp) },
        })
      }
    }

    res.status(200).json({ videoUrl, audioUrl, success: true })
  } catch (err) {
    console.error('Manual fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch artifacts' })
  }
}
