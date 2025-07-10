import 'dotenv/config';

import { Client } from 'eris';
import { SlashCreator, GatewayServer } from 'slash-create';
import * as commands from './commands.ts';
import { startServer } from './webserver/app.js';

export const client = new Client(process.env.DISCORD_BOT_TOKEN!);

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

  await Promise.all([client.connect(), startServer(Number(process.env.PORT ?? '3000'))]);
}

main()
  .then(() => console.log('Ready'))
  .catch(console.error);
