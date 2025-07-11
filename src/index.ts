import 'dotenv/config';

import { Client, Constants, Message, PublicThreadChannel } from 'eris';
import { SlashCreator, GatewayServer } from 'slash-create';
import * as commands from './commands.ts';
import { startServer } from './webserver/app.js';
import {
  handleNewDiscordThread,
  handleNewDiscordMessageInThread,
  handleEditedDiscordMessageInThread,
  handleDeletedDiscordMessageInThread,
  handleDeletedDiscordThread,
  handleUpdatedDiscordThread
} from './service/discord.js';

export const client = new Client(process.env.DISCORD_BOT_TOKEN!, {
  intents: [
    Constants.Intents.guilds,
    Constants.Intents.messageContent,
    Constants.Intents.guildMessages,
    Constants.Intents.guildMessageReactions
  ]
});

let creator: SlashCreator;

// Since we only get our secrets on fetch, set them before running
async function main() {
  creator = new SlashCreator({
    applicationID: process.env.DISCORD_APP_ID!,
    publicKey: process.env.DISCORD_PUBLIC_KEY!,
    token: process.env.DISCORD_BOT_TOKEN!,
    client
  });

  creator.withServer(
    new GatewayServer((handler) =>
      client.on('rawWS', (event) => {
        if (event.t === 'INTERACTION_CREATE') {
          handler(event.d as any);
        }
      })
    )
  );

  creator.registerCommands(Object.values(commands));
  await creator.syncCommands();

  creator.on('warn', (message) => console.warn(message));
  creator.on('error', (error) => console.error(error.stack || error.toString()));
  creator.on('commandRun', (command, _, ctx) =>
    console.info(`${ctx.user.username}#${ctx.user.discriminator} (${ctx.user.id}) ran command ${command.commandName}`)
  );
  creator.on('commandError', (command, error) =>
    console.error(`Command ${command.commandName} errored:`, error.stack || error.toString())
  );

  client.on('messageCreate', async (message: Message<PublicThreadChannel<true>>) => {
    if (message.channel?.type === 11) {
      try {
        await handleNewDiscordMessageInThread(message);
      } catch (err) {
        console.error('Failed to sync Discord comment to GitHub:', err);
      }
    }
  });

  client.on('messageUpdate', async (newMessage: Message<PublicThreadChannel<true>>) => {
    if (newMessage?.channel?.type === 11) {
      try {
        await handleEditedDiscordMessageInThread(newMessage);
      } catch (err) {
        console.error('Failed to sync Discord edit to GitHub:', err);
      }
    }
  });

  client.on('threadDelete', async (channel: PublicThreadChannel<true>) => {
    if (channel.type === 11) {
      try {
        await handleDeletedDiscordThread(channel);
      } catch (err) {
        console.error('Failed to delete GitHub issue for deleted Discord post:', err);
      }
    }
  });

  client.on('messageDelete', async (deletedMessage: Message<PublicThreadChannel<true>>) => {
    if (deletedMessage.channel?.type === 11) {
      try {
        await handleDeletedDiscordMessageInThread(deletedMessage);
      } catch (err) {
        console.error('Failed to sync Discord deletion to GitHub:', err);
      }
    }
  });

  client.on('threadUpdate', async (channel: PublicThreadChannel<true>) => {
    if (channel.type === 11) {
      try {
        await handleUpdatedDiscordThread(channel);
      } catch (err) {
        console.error('Failed to sync Discord thread update to GitHub:', err);
      }
    }
  });

  client.on('ready', () => console.log('Bot Ready'));

  await Promise.all([client.connect(), startServer(Number(process.env.PORT ?? '3000'))]);
}

main()
  .then(() => console.log('Ready'))
  .catch(console.error);
