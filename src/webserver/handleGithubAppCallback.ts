import { db } from '../db/client.ts';
import { user } from '../db/schema.ts';
import express from 'express';
import { getClient } from '../service/github.js';

export async function handleGithubAppCallback(req: express.Request, res: express.Response) {
  try {

    const installationId = parseInt(req.query.installation_id as string, 10);
    const state = req.query.state as string;

    if (!installationId || !state) {
      return res.status(400).send('Missing installation_id or state.');
    }

    const discordUserId = state;

    // Create an app-level Octokit instance
    const appOctokit = getClient();

    const { data: installation } = await appOctokit.rest.apps.getInstallation({
      installation_id: installationId
    });
    const githubUserId = installation.account!.id.toString();
    const githubLogin = installation.account!.login as string;

    await db.insert(user).values({
      discordUserId,
      githubUserId,
      githubLogin,
      githubInstallationId: installationId.toString()
    });

    return res.send(
      'GitHub App installed and linked to your Discord account. You can return to Discord and run `/link` again.'
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Something went wrong");
  }
}
