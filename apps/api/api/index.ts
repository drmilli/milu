import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the request to Express app
  return app(req, res);
}


