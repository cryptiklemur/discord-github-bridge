import { CommandContext } from 'slash-create';
import { eq } from 'drizzle-orm';
import { repository, tag } from '../db/schema.ts';
import { fetchIssueTemplate, fetchLabels, parseYamlIssueTemplate } from './github.ts';
import { db } from '../db/client.ts';
import { client } from '../index.ts';
import {ForumChannel} from 'eris';

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

export async function syncForum(repo: typeof repository.$inferSelect) {
  if (!repo.githubToken) {
    throw new Error('A GitHub token is required to sync this repository');
  }

  const { content: templateContent, defaultLabels, isYaml } = await fetchIssueTemplate(repo);
  const guidelines = generatePostGuidelines(templateContent, isYaml);

  // Sync labels → tags
  const labels = await fetchLabels(repo);
  for (const label of labels) {
    const exists = await db.query.tag.findFirst({
      where: (t) => eq(t.repositoryId, repo.id) && eq(t.githubLabelName, label.name)
    });

    if (!exists) {
      /* await db.insert(tag).values({
        repositoryId: repo.id,
        githubLabelName: label.name,
        githubLabelColor: label.color
      });*/
    }
  }

  // Update Discord forum
  const guild = client.guilds.get(String(repo.discordServerId));
  const forumChannel = guild?.channels.get(String(repo.discordChannelId));

  console.log(forumChannel);
  if (!forumChannel || forumChannel.type !== 15) {
    throw new Error('Forum channel not found or is not editable.');
  }
  await (forumChannel as ForumChannel).edit({
    availableTags: labels.map((l: any) => ({ id: l.id, name: l.name, moderated: true })),
    topic: guidelines.slice(0, 4096) // truncate to Discord max
  });

  return { labels, defaultLabels };
}
