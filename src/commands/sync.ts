import { SlashCommand, CommandContext, SlashCreator, AutocompleteContext } from 'slash-create';
import { db, getRepo } from '../db/client.ts';
import { repository } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { Client } from 'eris';
import { syncForum } from '../service/sync.ts';
import { fetchUser } from '../utils/fetchUser.js';
import { getClient } from '../service/github.js';

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
          name: 'template',
          description: 'Optional issue template name to override',
          required: false,
          autocomplete: true
          // Autocomplete will be registered in the class
        }
      ]
    });
  }

  async run(ctx: CommandContext) {
    await ctx.defer(true);
    const channelId = ctx.options.channel;
    const overrideTemplate = ctx.options.template ?? null;

    if (!(await fetchUser(ctx))) {
      return;
    }

    const repo = await getRepo(channelId);

    if (!repo) {
      await ctx.send({
        ephemeral: true,
        content: 'No repository is linked to that channel.'
      });
      return;
    }

    if (overrideTemplate) {
      const update: Partial<typeof repository.$inferInsert> = {};
      if (overrideTemplate) {
        update.issueTemplate = overrideTemplate;
      }

      await db.update(repository).set(update).where(eq(repository.id, repo.id));
    }

    try {
      await syncForum((await getRepo(channelId))!);

      await ctx.send({
        ephemeral: true,
        content: `Synced labels and updated post guidelines.`
      });
    } catch (e) {
      await ctx.send({
        ephemeral: true,
        content: (e as Error).message
      });
    }
  }

  /**
   * Autocomplete handler for the template option.
   */
  async autocomplete(ctx: AutocompleteContext): Promise<void> {
    if (ctx.focused === 'template') {
      const channelId = ctx.options.channel;
      const repo = await getRepo(channelId);
      if (!repo?.user?.githubInstallationId) {
        await ctx.sendResults([]);
        return;
      }

      const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');
      try {
        const octokit = getClient(repo.user.githubInstallationId);
        const { data: contents } = await octokit.rest.repos.getContent({
          owner,
          repo: repoName,
          path: '.github/ISSUE_TEMPLATE'
        });

        const items = Array.isArray(contents)
          ? contents
              .filter((f) => f.type === 'file' && /\.(ya?ml|md)$/.test(f.name))
              .map((f) => ({
                name: f.name.replace(/\.(ya?ml|md)$/, ''),
                value: f.name.replace(/\.(ya?ml|md)$/, '')
              }))
          : [];

        await ctx.sendResults(items.slice(0, 25));
      } catch {
        await ctx.sendResults([]);
      }
    }
  }
}
