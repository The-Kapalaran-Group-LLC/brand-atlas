import type { Request, Response } from 'express';
import { createArchaeologistWebSearchHandler } from '../../server/archaeologist-web-search.js';

const searchHandler = createArchaeologistWebSearchHandler();

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  await searchHandler(req, res);
}
