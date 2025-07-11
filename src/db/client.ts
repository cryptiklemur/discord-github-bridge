import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.ts';
import { and, eq } from 'drizzle-orm';
import {FullRepository, issue} from './schema.ts';

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


export async function getIssueByThreadId(threadId: string) {
  return db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, threadId),
    with: {
      repository: true,
      comments: true,
    },
  });
}
