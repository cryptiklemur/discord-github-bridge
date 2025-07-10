import { CommandContext } from 'slash-create';
import { user, User } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';

export async function fetchUser(ctx: CommandContext): Promise<User | undefined> {
  const userEntity = await db.query.user
    .findFirst({
      where: eq(user.discordUserId, ctx.user.id)
    })
    .catch(() => undefined);
  if (!userEntity?.githubInstallationId) {
    await ctx.send({
      ephemeral: true,
      content: 'Please install the GitHub App to continue:',
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Install GitHub App',
              url: `https://github.com/apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${ctx.user.id}`
            }
          ]
        }
      ]
    });
    return;
  }

  return userEntity;
}
