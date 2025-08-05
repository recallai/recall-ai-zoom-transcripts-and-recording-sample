// lib/recall-media.ts
const BASE = 'https://us-east-1.recall.ai/api/v1'
const HEADERS = {
  Authorization: process.env.RECALL_API_KEY ?? '',
  Accept: 'application/json',
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function waitForRecordingId(botId: string, tries = 20): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const url = `${BASE}/bot/${botId}/`
    const r = await fetch(url, { headers: HEADERS })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      console.warn(`waitForRecordingId: GET ${url} -> ${r.status} ${r.statusText} ${text}`)
      await sleep(3000)
      continue
    }
    const j = await r.json().catch((e) => (console.warn('waitForRecordingId: bad JSON', e), null))
    const id = j?.recordings?.[0]?.id ?? null
    if (id) return id
    await sleep(3000)
  }
  console.warn('waitForRecordingId: no recordingId after retries', { botId })
  return null
}

export async function getMediaShortcuts(recordingId: string) {
  const url = `${BASE}/recording/${recordingId}/`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    console.warn(`getMediaShortcuts: GET ${url} -> ${r.status} ${r.statusText} ${text}`)
    return null
  }
  const j = await r.json().catch((e) => (console.warn('getMediaShortcuts: bad JSON', e), null))
  return j?.media_shortcuts ?? null
}

export async function fetchArtifacts(recordingId: string) {
  const shortcuts = await getMediaShortcuts(recordingId)
  let videoUrl: string | null = shortcuts?.video_mixed?.data?.download_url ?? null
  let audioUrl: string | null = shortcuts?.audio_mixed?.data?.download_url ?? null

  for (let i = 0; i < 10 && (!videoUrl || !audioUrl); i++) {
    if (!videoUrl) {
      const vUrl = `${BASE}/video_mixed?recording_id=${recordingId}`
      const vRes = await fetch(vUrl, { headers: HEADERS })
      const v = await vRes.json().catch(() => null)
      videoUrl = v?.results?.[0]?.data?.download_url ?? null
    }
    if (!audioUrl) {
      const aUrl = `${BASE}/audio_mixed?recording_id=${recordingId}`
      const aRes = await fetch(aUrl, { headers: HEADERS })
      const a = await aRes.json().catch(() => null)
      audioUrl = a?.results?.[0]?.data?.download_url ?? null
    }
    if (!videoUrl || !audioUrl) await sleep(5000)
  }
  return { videoUrl, audioUrl }
}

export async function fetchStructuredTranscriptByRecording(recordingId: string): Promise<any[] | null> {
  const url = `${BASE}/transcript?recording_id=${recordingId}`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    console.warn(`fetchStructuredTranscriptByRecording: GET ${url} -> ${r.status} ${r.statusText} ${text}`)
    return null
  }
  const j = await r.json().catch((e) => (console.warn('fetchStructuredTranscriptByRecording: bad JSON', e), null))
  return j?.data ?? null
}
