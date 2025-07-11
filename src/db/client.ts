import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.ts';
import { eq } from 'drizzle-orm';
import { FullRepository } from './schema.ts';

export const db = drizzle({
  schema,
  mode: 'default',
  connection: process.env.DATABASE_URL!
});

export async function getRepo(channelId: string): Promise<FullRepository | undefined> {
  return db.query.repository.findFirst({
    where: eq(schema.repository.discordChannelId, channelId),
    with: { user: true, tags: true }
  });
}
