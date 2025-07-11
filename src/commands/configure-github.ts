import crypto from 'node:crypto';
import { SlashCommand, SlashCreator, CommandContext } from 'slash-create';
import { db, getRepo } from '../db/client.ts';
import { repository } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import { syncForum } from '../service/sync.ts';
import { fetchUser } from '../utils/fetchUser.js';

export default class ConfigureGithubCommand extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'configure-github',
      description: 'Gives a link to reconfigure your github app',
      defaultPermission: false,
      requiredPermissions: ['MANAGE_GUILD'],
    });
  }

  async run(ctx: CommandContext) {
    await ctx.defer(true);

    try{
      await ctx.send({
        ephemeral: true,
        content: '',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Configure Discord-GitHub-Bridge App',
                url: `https://github.com/apps/${process.env.GITHUB_APP_NAME}`
              }
            ]
          }
        ]
      });
    } catch (err) {
      console.error(err);
      await ctx.send({
        ephemeral: true,
        content: 'Something went wrong'
      });
    }
  }
}
