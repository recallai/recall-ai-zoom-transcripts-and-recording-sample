import { NextApiRequest, NextApiResponse } from "next"

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    console.log(`Unexpected API call: ${req.method} ${req.url}`)
    res.status(404).json({ error: 'Not found' })
  }