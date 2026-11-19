import type { Request, Response } from 'express';
import { createApp } from '../server.ts';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  appPromise ??= createApp();

  try {
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    console.error('Failed to initialize API:', error);
    res.status(500).json({ error: 'Unable to initialize the server.' });
  }
}
