import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL || String(Date.now());
  res.status(200).json({ version });
}
