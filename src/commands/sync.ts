import { SlashCommand, CommandContext, SlashCreator } from 'slash-create';
import { db } from '../db/client.ts';
import { repository, tag } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { Client } from 'eris';
import { fetchIssueTemplate, fetchLabels } from '../service/github.ts';
import { syncForum } from '../service/sync.ts';

export default class SyncRepositoryCommand extends SlashCommand {
  constructor(
    creator: SlashCreator,
    private bot: Client
  ) {
    super(creator, {
      name: 'sync',
      description: 'Sync GitHub labels and post guidelines for a linked repository',
      defaultPermission: false,
      requiredPermissions: ['MANAGE_GUILD'],
      options: [
        {
          type: 7, // CHANNEL
          name: 'channel',
          description: 'Forum channel associated with the repository',
          required: true,
          channel_types: [15]
        },
        {
          type: 3, // STRING
          name: 'repo_token',
          description: 'Optional GitHub token to use during sync',
          required: false
        },
        {
          type: 3, // STRING
          name: 'template',
          description: 'Optional issue template name to override',
          required: false
        }
      ]
    });
  }

  async run(ctx: CommandContext) {
    await ctx.defer(true);
    const channelId = ctx.options.channel;
    const token = ctx.options.repo_token;
    const overrideTemplate = ctx.options.template ?? null;

    let repo = await db.query.repository.findFirst({
      where: eq(repository.discordChannelId, BigInt(channelId))
    });

    if (!repo) {
      await ctx.send({
        ephemeral: true,
        content: 'No repository is linked to that channel.'
      });
      return;
    }

    if (overrideTemplate || token) {
      const update: Partial<typeof repository.$inferInsert> = {};
      if (overrideTemplate) {
        update.issueTemplate = overrideTemplate;
      }
      if (token) {
        update.githubToken = token;
      }

      const results = await db.update(repository).set(update).where(eq(repository.id, repo.id)).returning();
      repo = results[0];
    }

    try {
      const { labels, defaultLabels } = await syncForum(repo);
      if (defaultLabels.length > 0) {
        repo = await db.update(repository)
          .set({defaultLabels})
          .where(eq(repository.id, repo.id))
          .returning().then(x => x[0]);
      }

      await ctx.send({
        ephemeral: true,
        content: `Synced ${labels.length} labels and updated post guidelines.`
      });
    } catch (e) {
      await ctx.send({
        ephemeral: true,
        content: (e as Error).message
      });
    }
  }
}
