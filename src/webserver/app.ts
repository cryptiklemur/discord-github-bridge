import crypto from 'node:crypto';
import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import { githubWebhookMiddleware, handleGithubWebhookEvent } from './handleGithubWebhookEvent.js';

// src/types/express.d.ts
import { RepositoryWithUser } from '../db/schema.ts';
import { handleGithubAppCallback } from './handleGithubAppCallback.ts';

declare global {
  namespace Express {
    interface Request {
      repo?: RepositoryWithUser;
      rawBody?: Buffer;
    }
  }
}

export const app = express();
app
  .use(express.raw({ type: 'application/json' }))
  .use(morgan('tiny'))
  .use(compression());

app
  .get('/github/callback', handleGithubAppCallback)
  .post('/github/webhook', githubWebhookMiddleware, async (req, res) => {
    try {
      await handleGithubWebhookEvent(req);
      res.sendStatus(204);
    } catch (err) {
      console.error('Webhook handling failed:', err);
      res.sendStatus(500);
    }
  });

export function verifySignature(secret: string, signature: string, payload: Buffer): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function startServer(port: number) {
  app.listen(port, () => {
    console.log('Webserver started on port ' + port);
  });
}
