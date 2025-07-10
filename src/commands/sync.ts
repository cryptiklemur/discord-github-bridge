import { SlashCommand, CommandContext, SlashCreator } from 'slash-create';
import { db, getRepoWithUserByChannel } from '../db/client.ts';
import { repository } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { Client } from 'eris';
import { syncForum } from '../service/sync.ts';
import { fetchUser } from '../utils/fetchUser.js';

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
          required: false
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

    const repo = await getRepoWithUserByChannel(channelId);

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
      await syncForum((await getRepoWithUserByChannel(channelId))!);

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
}
