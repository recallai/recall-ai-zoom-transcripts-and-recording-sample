// pages/api/startRecall.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

export default async function handler (
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { zoomLink, userId } = req.body as { zoomLink:string; userId:string }
  const externalId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // create recall.ai bot
  const botResp = await fetch('https://us-east-1.recall.ai/api/v1/bot', {
    method : 'POST',
    headers: {
      authorization : process.env.RECALL_API_KEY ?? '',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      meeting_url : zoomLink,
      external_id : externalId,
      metadata    : { external_id: externalId },

      webhook_url : 'https://open-many-ibex.ngrok-free.app/api/webhook',

      recording_config: {
        // finished artifacts I want rendered
        video_mixed_layout: 'gallery_view_v2',
        video_mixed_mp4   : {},
        audio_mixed_mp3   : {},

        // put whatever provider you want (meeting_captions or assembly_ai or deepgram etc)
        transcript: { provider: { meeting_captions: {} } },

        // streams each transcript line
        realtime_endpoints: [
          {
            type : 'webhook',
            url  : 'https://open-many-ibex.ngrok-free.app/api/webhook',
            events: ['transcript.data', 'transcript.partial_data']
          }
        ]
      }
    })
  })

  const bot = await botResp.json()
  console.log('bot created →', bot.id); 
  
  await prisma.meeting.create({
    data:{ userId, meetingUrl: zoomLink, externalId, botId: bot.id }
  })

  res.status(200).json({ status:'started', externalId, bot })
}
