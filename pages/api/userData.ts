// pages/api/userData.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query

  const meetings = await prisma.meeting.findMany({
    where: { userId: userId as string },
    orderBy: { createdAt: 'desc' },
    include: { transcript: true },
  })

  if (!meetings.length) {
    res.status(404).json({ message: 'No meetings found' })
    return
  }

  const latest = meetings[0];
 
  const transcript = latest.transcript.map((t) => ({
    text: t.text,
    speaker: t.speaker,
    timestamp: t.timestamp,
  }))
  //console.log('Transcript:', transcript)


  res.status(200).json({
    transcript,
    videoUrl: latest.videoUrl ?? null,
    audioUrl: latest.audioUrl ?? null
  })
  
}
