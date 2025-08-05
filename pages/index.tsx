'use client'
import React, { useRef, useEffect, useState } from 'react'

export default function Home() {
  const [zoomLink, setZoomLink] = useState('')
  const [transcript, setTranscript] = useState<{ text: string; speaker: string; timestamp: string }[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [userId, setUserId] = useState('')
  const [externalId, setExternalId] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let uid = localStorage.getItem('userId')
    if (!uid) {
      uid = 'user-' + Math.random().toString(36).slice(2)
      localStorage.setItem('userId', uid)
    }
    setUserId(uid)
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!videoUrl || !el) return

    let player: any
    const detach = () => {
      if (player) player.destroy()
      player = null
    }

    if (videoUrl.endsWith('.flv')) {
      import('flv.js').then(({ default: flvjs }) => {
        if (!flvjs.isSupported()) return
        player = flvjs.createPlayer({ type: 'flv', url: videoUrl })
        player.attachMediaElement(el)
        player.load()
      })
      return detach
    }

    el.src = videoUrl
    el.load()
    return () => {
      detach()
      el.removeAttribute('src')
    }
  }, [videoUrl])

  useEffect(() => {
    if (!userId) return
  
    const interval = setInterval(async () => {
      const res = await fetch(`/api/userData?userId=${userId}`)
      const json = await res.json()
  
      if (json.videoUrl || json.audioUrl) {
        setVideoUrl(json.videoUrl)
        setAudioUrl(json.audioUrl)
        clearInterval(interval)
      }
    }, 5000)
  
    return () => clearInterval(interval)
  }, [userId])
  
  const handleManualFetch = async () => {
    const res = await fetch(`/api/manualRetrieve?externalId=${externalId}`)
    const data = await res.json()
    
    if (data.videoUrl) setVideoUrl(data.videoUrl)
    if (data.audioUrl) setAudioUrl(data.audioUrl)
  }
  

  const startBot = async () => {
    console.log('startBot clicked', { zoomLink, userId })
  
    const res = await fetch('/api/startRecall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoomLink, userId }),
    })
  
    const json = await res.json()
    console.log('Recall.ai response:', json)
  
    const actualExternalId = json.externalId
    if (!actualExternalId) {
      console.warn('No external_id found in bot response')
      return
    }
  
    console.log('Setting externalId for reference:', actualExternalId)
    setExternalId(actualExternalId)
  
    // WebSocket setup
    const host =
      window.location.hostname === 'open-many-ibex.ngrok-free.app'
        ? 'wss://open-many-ibex.ngrok-free.app/recall'
        : 'ws://localhost:4000/recall'
  
    const ws = new WebSocket(`${host}?externalId=${actualExternalId}`)
  
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'transcript') {
        setTranscript((prev) => [
          ...prev,
          {
            text: msg.payload.text,
            speaker: msg.payload.speaker,
            timestamp: msg.payload.timestamp,
          },
        ])
      }
    }
  
    ws.onopen = () => console.log('WebSocket opened')
    ws.onerror = (err) => console.error('WebSocket error', err)
    ws.onclose = () => console.log('WebSocket closed')
  
    window.addEventListener('beforeunload', () => ws.close())
  }
  

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/userData?userId=${userId}`)
      if (!res.ok) {
        const text = await res.text()
        console.error('Error fetching user data:', res.status, text)
        return
      }

      const data = await res.json()
      console.log('userData response:', data)

      setTranscript(data.transcript)
      setVideoUrl(data.videoUrl)
      setAudioUrl(data.audioUrl)
    } catch (err) {
      console.error('Fetch failed:', err)
    }
  }

  const handleFetchWithDelay = () => {
    console.log('Waiting 2s before fetching user data...')
    setTimeout(fetchData, 2000)
  }

  return (
    <main>
      <h1>Start a Meeting Bot</h1>
      <input
        type="text"
        placeholder="Zoom meeting link"
        value={zoomLink}
        onChange={(e) => setZoomLink(e.target.value)}
      />
      <button onClick={startBot}>Start Bot</button>
      <button onClick={handleManualFetch}>Get Async Transcript & Video</button>

      <h2>Transcript</h2>
      <ul>
        {transcript.map((t, i) => (
          <li key={i}>
            <strong>{t.speaker}</strong>: {t.text}{' '}
            <em>({new Date(t.timestamp).toLocaleTimeString()})</em>
          </li>
        ))}
      </ul>

      {videoUrl && (
        <>
          <h2>Meeting Video</h2>
          <video ref={videoRef} width={640} controls src={videoUrl} />
          <br />
          <a href={videoUrl} download={`meeting-${externalId}.mp4`}>
            Download MP4
          </a>
        </>
      )}

      {audioUrl && (
        <>
          <h2>Meeting Audio</h2>
          <audio controls src={audioUrl} />
          <br />
          <a href={audioUrl} download={`meeting-${externalId}.mp3`}>
            Download MP3
          </a>
        </>
      )}
    </main>
  )
}
