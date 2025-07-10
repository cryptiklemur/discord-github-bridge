import { SlashCommand, SlashCreator, CommandContext } from 'slash-create';
import { db } from '../db/client.ts';
import { repository } from '../db/schema.ts';
import {and, eq} from 'drizzle-orm';
import { syncForum } from '../service/sync.ts';

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
          name: 'github_token',
          description: 'GitHub Personal Access Token with repo access',
          required: true
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
    const url = ctx.options.repo_url;
    const channel = BigInt(ctx.options.channel);
    const githubToken = ctx.options.github_token;
    const issueTemplate = ctx.options.template ?? null;

    // Basic GitHub URL validation
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) {
      await ctx.send({
        ephemeral: true,
        content: 'Invalid GitHub repository URL. Use the format: https://github.com/user/repo'
      });
      return;
    }

    try {
      const existing = await db.select().from(repository).where(and(eq(repository.url, url), eq(repository.discordChannelId, channel))).get();
      if (existing) {
        await ctx.send({
          ephemeral: true,
          content: 'That repository is already registered to that channel. Run the sync command if you want to sync changes',
        });
        return;
      }

      let repo = await db
        .insert(repository)
        .values({
          url,
          githubToken,
          discordServerId: BigInt(ctx.guildID!),
          discordChannelId: channel,
          issueTemplate
        })
        .returning().then(x => x[0]);

      try {
        const {defaultLabels} = await syncForum(repo);
        if (defaultLabels.length > 0) {
          repo = await db.update(repository)
            .set({defaultLabels})
            .where(eq(repository.id, repo.id))
            .returning().then(x => x[0]);
        }
      } catch (e) {
        await db.delete(repository).where(and(eq(repository.url, url), eq(repository.discordChannelId, channel)));
        throw e;
      }

      await ctx.send({
        ephemeral: true,
        content: `Repository linked: ${url} → <#${channel}>${issueTemplate ? " - Template - " + issueTemplate : ''}`
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
