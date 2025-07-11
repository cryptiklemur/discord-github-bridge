# Discord ↔ GitHub Bridge

A bidirectional sync tool between Discord forum posts and GitHub issues, built with TypeScript, Cloudflare Workers, and SQLite (via Drizzle). Automatically mirrors issues, comments, labels, status, and more between your GitHub repo and a Discord forum channel.

Add it to your server: https://discord.com/oauth2/authorize?client_id=1392676268784222238

## What It Does

- **Discord → GitHub**
  - Creating a post in Discord creates a GitHub issue
  - Comments in Discord sync to GitHub
  - Tags on the post become labels on the issue
  - Locking or closing a post locks or closes the issue
  - Deleting the post closes and locks the issue
  - Attachments are embedded directly into GitHub
- **GitHub → Discord**
  - Opening, closing, or locking an issue reflects in the Discord thread
  - Issue comments show up in the forum post
  - Labels on GitHub become tags on the post
  - Reopened issues unarchive and unlock the thread
  - Deleted GitHub comments are removed from Discord

## Setup

```sh
npm install
```

Create a `.env` file with the relevant secrets:

- `DISCORD_PUBLIC_KEY`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `WEBHOOK_SECRET`
- `DATABASE_URL`

Then run:

```sh
npm run dev
```

## Running in Production

Build and start the app:

```sh
npm start
```

To run migrations before boot, use:

```sh
npm run migrate && npm start
```

## Deployment

We publish a Docker container tagged with `latest` and the Git commit SHA to GitHub Container Registry.

If you're looking to self-host it, you’ll probably want to do the same. Make sure to configure your secrets and webhook URL correctly.

## Notes

- Uses SQLite via Drizzle ORM (Cloudflare D1-compatible)
- Uses Octokit to talk to GitHub
- Uses slash-create for Discord commands
- Ignores its own actions to avoid feedback loops