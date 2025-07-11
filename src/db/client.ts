import { drizzle } from 'drizzle-orm/libsql/node';
import * as schema from './schema.ts';
import { eq } from 'drizzle-orm';
import { FullRepository } from './schema.ts';

export const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL!
  },
  schema
});

export async function getRepo(channelId: string): Promise<FullRepository | undefined> {
  return db.query.repository.findFirst({
    where: eq(schema.repository.discordChannelId, channelId),
    with: { user: true, tags: true }
  });
}
