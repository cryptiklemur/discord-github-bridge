import crypto from 'node:crypto';
import { SlashCommand, SlashCreator, CommandContext } from 'slash-create';
import { db, getRepoWithUserByChannel } from '../db/client.ts';
import { repository, user } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import { syncForum } from '../service/sync.ts';
import { fetchUser } from '../utils/fetchUser.js';

export default class linkRepositoryCommand extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'link',
      description: 'Link a GitHub repository to a forum channel',
      defaultPermission: false,
      requiredPermissions: ['MANAGE_GUILD'],
      options: [
        {
          type: 3, // STRING
          name: 'repo_url',
          description: 'GitHub repository URL (https://...)',
          required: true
        },
        {
          type: 7, // CHANNEL
          name: 'channel',
          description: 'Forum channel to associate with this repository',
          required: true,
          channel_types: [15] // 15 = GUILD_FORUM
        },
        {
          type: 3, // STRING
          name: 'template',
          description: 'Optional issue template to use when syncing to GitHub',
          required: false
        }
      ]
    });
  }

  async run(ctx: CommandContext) {
    await ctx.defer(true);
    const url = ctx.options.repo_url.toLowerCase();
    const channel = ctx.options.channel;
    const issueTemplate = ctx.options.template ?? null;

    const userEntity = await fetchUser(ctx);
    if (!userEntity) {
      return;
    }

    // Basic GitHub URL validation
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) {
      await ctx.send({
        ephemeral: true,
        content: 'Invalid GitHub repository URL. Use the format: https://github.com/user/repo'
      });
      return;
    }

    try {
      const existing = await db
        .select()
        .from(repository)
        .where(and(eq(repository.url, url), eq(repository.discordChannelId, channel)))
        .get();
      if (existing) {
        await ctx.send({
          ephemeral: true,
          content:
            'That repository is already registered to that channel. Run the sync command if you want to sync changes'
        });
        return;
      }

      await db.insert(repository).values({
        url,
        githubWebhookSecret: crypto.randomBytes(32).toString('hex'),
        discordServerId: ctx.guildID!,
        discordChannelId: channel,
        issueTemplate,
        userId: userEntity.id
      });
      const repo = (await getRepoWithUserByChannel(channel))!;

      try {
        await syncForum(repo);
      } catch (e) {
        await db.delete(repository).where(and(eq(repository.url, url), eq(repository.discordChannelId, channel)));
        throw e;
      }

      await ctx.send({
        ephemeral: true,
        content: `Repository linked: ${url} → <#${channel}>${issueTemplate ? ' - Template - ' + issueTemplate : ''}`
      });
    } catch (err) {
      console.error(err);
      await ctx.send({
        ephemeral: true,
        content: 'Failed to link repository'
      });
    }
  }
}
