import { eq } from 'drizzle-orm';
import { FullRepository, tag } from '../db/schema.ts';
import { createOrUpdateWebhookIfMissing, fetchIssueTemplate, fetchLabels, parseYamlIssueTemplate } from './github.ts';
import { db, getRepo } from '../db/client.ts';
import { client } from '../index.ts';
import { ForumChannel } from 'eris';

function stripFrontmatter(markdown: string): string {
  if (markdown.startsWith('---')) {
    const end = markdown.indexOf('---', 3);
    if (end !== -1) return markdown.slice(end + 3).trimStart();
  }
  return markdown;
}

export function generatePostGuidelines(templateContent: string | null, isYaml: boolean = false): string {
  let preview: string;

  if (!templateContent) {
    preview = '';
  } else if (isYaml) {
    preview = '\n' + parseYamlIssueTemplate(templateContent);
  } else {
    preview = '\n' + stripFrontmatter(templateContent).slice(0, 1500);
  }

  return [
    `## Post Guidelines`,
    `This forum is linked to a GitHub repository. Posts here will automatically create GitHub issues.`,
    preview
  ].join('\n');
}

export async function syncForum(repo: FullRepository) {
  await createOrUpdateWebhookIfMissing(repo);

  const { content: templateContent, isYaml } = await fetchIssueTemplate(repo);

  const guidelines = generatePostGuidelines(templateContent, isYaml);

  // Sync labels → tags
  const labels = await fetchLabels(repo);
  for (const label of labels) {
    const exists = await db.query.tag.findFirst({
      where: (t) => eq(t.repositoryId, repo.id) && eq(t.githubLabelName, label.name)
    });

    if (!exists) {
      await db.insert(tag).values({
        repositoryId: repo.id,
        githubLabelId: label.id,
        githubLabelName: label.name
      });
    }
  }

  // Update Discord forum
  const guild = client.guilds.get(String(repo.discordServerId));
  let forumChannel = guild?.channels.get(String(repo.discordChannelId)) as ForumChannel;
  if (!forumChannel) {
    throw new Error('Forum channel not found or is not editable.');
  }
  const tags = await db.query.tag.findMany({ where: eq(tag.repositoryId, repo.id) });
  const availableTags = tags.map((l) => ({ id: l.discordTagId as string, name: l.githubLabelName, moderated: true }));

  forumChannel = await forumChannel.edit({
    availableTags,
    topic: guidelines.slice(0, 4096) // truncate to Discord max
  });

  for (const discordTag of forumChannel.availableTags) {
    await db.update(tag).set({ discordTagId: discordTag.id }).where(eq(tag.githubLabelName, discordTag.name));
  }

  return getRepo(repo.discordChannelId).then((r) => r!);
}
