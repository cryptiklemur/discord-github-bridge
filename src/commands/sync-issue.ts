import { SlashCommand, SlashCreator, CommandContext, ChannelType } from 'slash-create';
import {getIssueByThreadId, getRepo} from '../db/client.ts';
import {handleNewDiscordMessageInThread, handleNewDiscordThread} from '../service/discord.ts';
import {client} from '../index.js';
import {PublicThreadChannel} from 'eris';

export default class SyncIssueCommand extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'sync-issue',
      description: 'Syncs a Discord thread to a GitHub Issue (creates it if needed)',
      options: [
        {
          name: 'thread',
          type: 11, // CHANNEL type
          description: 'The forum thread to sync',
          required: false,
          channel_types: [ChannelType.GUILD_PUBLIC_THREAD, ChannelType.GUILD_PRIVATE_THREAD],
        },
      ],
      defaultPermission: false,
      requiredPermissions: ['MANAGE_GUILD'],
    });
  }

  async run(ctx: CommandContext) {
    await ctx.defer(true);

    const threadId = ctx.options.thread || ctx.channelID;
    const thread = client.getChannel(threadId) as PublicThreadChannel<true>;

    if (thread?.type !== 11) {
      return ctx.send({ ephemeral: true, content: 'This command must be used in a thread or specify a valid thread.' });
    }

    const repo = await getRepo(thread.parentID!);
    if (!repo) {
      return ctx.send({ ephemeral: true, content: 'No repository is linked to this forum.' });
    }

    const issue = await getIssueByThreadId(threadId);

    if (!issue) {
      // create the issue and sync comments
      await handleNewDiscordThread(thread);
    }

    // Sync comments from thread
    for (const message of await thread.getMessages()) {
      if (message.id === thread.id) continue; // skip the original post
      await handleNewDiscordMessageInThread(message);
    }

    return ctx.send({ ephemeral: true, content: 'Thread synced to GitHub successfully.' });
  }
}
