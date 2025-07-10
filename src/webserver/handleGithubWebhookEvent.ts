import { eq } from 'drizzle-orm';
import express, { Request, Response, NextFunction } from 'express';
import { ForumChannel, ThreadChannel } from 'eris';

import { client } from '../index.js';
import { db } from '../db/client.ts';
import { issue, comment, repository, tag, RepositoryWithUser } from '../db/schema.ts';
import { verifySignature } from './app.js';
import { syncForum } from '../service/sync.js';
import { getClient } from '../service/github.js';

async function isSubIssueREST(repo: RepositoryWithUser, issue: any): Promise<boolean> {
  const octokit = getClient(repo.user.githubInstallationId);
  const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');
  const { data: events } = await octokit.rest.issues.listEventsForTimeline({
    owner,
    repo: repoName,
    issue_number: issue.number
  });

  return events.some((ev) => ev.event === 'parent_issue_added');
}

/**
 * Fetches sub-issues via Octokit and appends them as links
 * to the first bot-authored message in the given thread.
 */
async function appendSubIssuesToFirstMessage(repo: RepositoryWithUser, thread: ThreadChannel, issue: any) {
  const octokit = getClient(repo.user.githubInstallationId);
  const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');

  // Use the sub-issues endpoint
  const { data: subIssues } = await octokit.rest.issues.listSubIssues({
    owner,
    repo: repoName,
    issue_number: issue.number
  });

  if (subIssues.length === 0) return;

  const messages = await thread.getMessages({ limit: 5 });
  const first = messages.reverse().find((m) => m.author.id === client.user.id && m.content.includes(issue.html_url));
  if (!first) return;

  const subLinks = subIssues.map((i) => `- [${i.title}](${i.html_url})`).join('\n');

  const updated = `${first.content}\n\n**Sub-Issues:**\n${subLinks}`;
  await thread.editMessage(first.id, { content: updated });
}
/**
 * Maps GitHub issue labels to corresponding Discord forum tag IDs for the given repo.
 */
async function getAppliedTagIds(payload: any, repo: RepositoryWithUser): Promise<string[]> {
  const labelIds: number[] = payload.issue.labels.map((l: any) => l.id);
  const dbTags = await db.query.tag.findMany({
    where: eq(tag.repositoryId, repo.id)
  });

  const tagIdMap = new Map<number, string>(dbTags.map((t) => [t.githubLabelId, t.discordTagId!.toString()]));

  return labelIds.map((id) => tagIdMap.get(id)).filter(Boolean) as string[];
}

export async function githubWebhookMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = req.body as Buffer;

    const json = JSON.parse(rawBody.toString('utf8'));
    const repoFullName = json?.repository?.full_name; // e.g. "user/repo"
    if (!repoFullName || !signature) return res.status(400).send('Invalid payload');

    const repoUrl = `https://github.com/${repoFullName}`.toLowerCase();
    let repo: RepositoryWithUser | undefined = await db.query.repository.findFirst({
      where: eq(repository.url, repoUrl),
      with: {
        user: true
      }
    });

    if (!repo) return res.status(404).send('Repository not linked');
    if (!verifySignature(repo.githubWebhookSecret, signature, rawBody)) {
      return res.status(401).send('Invalid signature');
    }

    repo = await syncForum(repo).then((x) => x.repo);
    req.repo = repo;
    req.rawBody = rawBody;
    req.body = json;

    next();
  } catch (err) {
    console.error('Webhook middleware error:', err);
    res.sendStatus(500);
  }
}

export async function handleGithubWebhookEvent(req: express.Request) {
  const event = req.headers['x-github-event'] as string;
  const payload = req.body;
  const repo = req.repo!;

  switch (event) {
    case 'issue_comment':
      switch (payload.action) {
        case 'created':
          return handleNewComment(payload, repo);
        case 'edited':
          return handleEditedComment(payload, repo);
        case 'deleted':
          return handleDeletedComment(payload, repo);
      }
      break;
    case 'issues':
      switch (payload.action) {
        case 'opened':
          return handleNewIssue(payload, repo);
        case 'edited':
          return handleEditedIssue(payload, repo);
        case 'closed':
        case 'reopened':
        case 'locked':
        case 'unlocked':
          return handleIssueStateChange(payload, repo);
        case 'deleted':
          return handleDeletedIssue(payload, repo);
        case 'labeled':
        case 'unlabeled':
          return handleLabelChange(payload, repo);
      }
  }
}

/**
 * Handles a newly created GitHub comment.
 * Backfills the issue thread if it doesn’t exist,
 * then posts the comment as a Discord message.
 */
async function handleNewComment(payload: any, repo: RepositoryWithUser) {
  const issueId = payload.issue.id;
  const linked = await db.query.issue.findFirst({
    where: eq(issue.githubIssueId, issueId)
  });

  if (!linked) {
    // Backfill the issue thread
    console.warn(`[fallback] Creating issue for missing comment thread: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleNewComment(payload, repo); // Retry once created
  }

  if (!linked.discordForumPostId) {
    console.warn(`[fallback] Creating issue for missing comment thread: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleNewComment(payload, repo); // Retry once created
  }

  const thread = client.getChannel(String(linked.discordForumPostId)) as ThreadChannel;
  const content = `**${payload.comment.user.login}** commented ([view on GitHub](${payload.comment.html_url})):\n${payload.comment.body}`;
  const message = await thread.createMessage({ content });

  await db.insert(comment).values({
    githubCommentId: payload.comment.id,
    discordMessageId: message.id,
    issueId: linked.id,
    githubAuthorId: payload.comment.user.id,
    githubAuthorName: payload.comment.user.login,
    isGithubSynced: true,
    isDiscordSynced: false
  });
}
/**
 * Handles editing a GitHub comment.
 * If the comment or issue is missing, triggers a backfill.
 * Updates the Discord message with new content.
 */
async function handleEditedComment(payload: any, repo: RepositoryWithUser) {
  const githubCommentId = payload.comment.id;

  const linkedComment = await db.query.comment.findFirst({
    where: eq(comment.githubCommentId, githubCommentId)
  });

  if (!linkedComment) {
    // Backfill the comment as if it were newly created
    console.warn(`[fallback] Creating comment for missing edited comment: ${payload.comment.html_url}`);
    return handleNewComment(payload, repo);
  }

  if (!linkedComment.discordMessageId) {
    // Also backfill from scratch
    console.warn(`[fallback] Recreating Discord message for edited comment: ${payload.comment.html_url}`);
    return handleNewComment(payload, repo);
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.id, linkedComment.issueId)
  });

  if (!issueRecord || !issueRecord.discordForumPostId) return;

  try {
    await client.editMessage(
      String(issueRecord.discordForumPostId),
      String(linkedComment.discordMessageId),
      `**${payload.comment.user.login}** edited their comment ([view on GitHub](${payload.comment.html_url})):\n${payload.comment.body} (edited)`
    );

    await db
      .update(comment)
      .set({
        isGithubSynced: true,
        isDiscordSynced: true
      })
      .where(eq(comment.id, linkedComment.id));
  } catch (err) {
    console.warn(`Failed to update Discord message for GitHub comment ${githubCommentId}:`, err);
  }
}
/**
 * Handles deleting a GitHub comment.
 * Deletes the corresponding Discord message and removes it from the DB.
 */
async function handleDeletedComment(payload: any, repo: RepositoryWithUser) {
  const linked = await db.query.comment.findFirst({
    where: eq(comment.githubCommentId, payload.comment.id)
  });

  if (!linked || !linked.discordMessageId) return; // nothing to delete

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.id, linked.issueId)
  });

  if (!issueRecord || !issueRecord.discordForumPostId) return;

  try {
    await client.deleteMessage(String(issueRecord.discordForumPostId), String(linked.discordMessageId)).catch(void 0);

    await db.delete(comment).where(eq(comment.id, linked.id));
  } catch (err) {
    console.warn(`Failed to delete Discord message for GitHub comment ${payload.comment.id}`, err);
  }
}
/**
 * Handles GitHub issue state changes (close, reopen, lock, unlock).
 * Applies the equivalent state to the Discord thread.
 */
async function handleIssueStateChange(payload: any, repo: RepositoryWithUser) {
  if (payload.issue?.pull_request) return;

  const issueId = payload.issue.id;
  const linked = await db.query.issue.findFirst({
    where: eq(issue.githubIssueId, issueId)
  });

  if (!linked || !linked.discordForumPostId) return;

  const thread = client.getChannel(String(linked.discordForumPostId)) as ThreadChannel;
  const action = payload.action;

  switch (action) {
    case 'closed':
      await thread.edit({ archived: true, locked: true });
      break;
    case 'reopened':
      await thread.edit({ archived: false, locked: false });
      break;
    case 'locked':
      await thread.edit({ locked: true });
      break;
    case 'unlocked':
      await thread.edit({ locked: false });
      break;
  }
}
/**
 * Handles creation of a new GitHub issue.
 * Creates a corresponding Discord forum thread with the correct tags.
 */
async function handleNewIssue(payload: any, repo: RepositoryWithUser) {
  if (await isSubIssueREST(repo, payload.issue)) return;

  const thread = client.getChannel(String(repo.discordChannelId)) as ForumChannel;
  if (!thread) return;

  const title = payload.issue.title;
  const body = payload.issue.body || '*No description*';
  const appliedTagIds = await getAppliedTagIds(payload, repo);

  // Create the Discord thread
  const createdThread = await client.createThread(String(repo.discordChannelId), {
    name: title,
    appliedTags: appliedTagIds,
    message: {
      content: `**${payload.issue.user.login}** created an issue ([view on GitHub](${payload.issue.html_url})):\n\n${body}`
    } as any
  });

  await db.insert(issue).values({
    repositoryId: repo.id,
    githubIssueId: payload.issue.id,
    discordForumPostId: createdThread.id,
    githubAuthorId: payload.issue.user.id,
    githubAuthorName: payload.issue.user.login,
    isGithubSynced: true,
    isDiscordSynced: false
  });

  const octokit = getClient(repo.user.githubInstallationId);
  const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo: repoName,
    issue_number: payload.issue.number
  });

  for (const commentPayload of comments) {
    await handleNewComment({ ...payload, comment: commentPayload }, repo);
  }

  // Fetch sub-issues and append them to the main post
  await appendSubIssuesToFirstMessage(repo, createdThread, payload.issue);
}
/**
 * Handles deletion of a GitHub issue.
 * Deletes the corresponding Discord thread and removes it from the DB.
 */
async function handleDeletedIssue(payload: any, repo: RepositoryWithUser) {
  if (payload.issue?.pull_request) return;

  const linked = await db.query.issue.findFirst({
    where: eq(issue.githubIssueId, payload.issue.id)
  });

  if (!linked || !linked.discordForumPostId) return;

  try {
    const thread = client.getChannel(String(linked.discordForumPostId));
    if (thread?.type === 12) {
      await thread.delete('GitHub issue was deleted');
    }
  } catch (err) {
    console.warn(`Could not delete Discord thread for issue ${payload.issue.id}`, err);
  }

  // Optional: remove or mark deleted in DB
  await db.delete(issue).where(eq(issue.id, linked.id));
}
/**
 * Handles editing a GitHub issue's title or body.
 * Updates the thread name and original message content.
 * Also re-syncs the full label set as Discord tags.
 */
async function handleEditedIssue(payload: any, repo: RepositoryWithUser) {
  if (await isSubIssueREST(repo, payload.issue)) return;

  const linked = await db.query.issue.findFirst({
    where: eq(issue.githubIssueId, payload.issue.id)
  });

  if (!linked) {
    console.warn(`[fallback] Creating issue for edited issue: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleEditedIssue(payload, repo); // Retry after creation
  }

  if (!linked.discordForumPostId) {
    console.warn(`[fallback] Creating issue for edited issue: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleEditedIssue(payload, repo); // Retry after creation
  }

  const thread = client.getChannel(String(linked.discordForumPostId)) as ThreadChannel;
  if (!thread) return;

  // Sync all GitHub labels to Discord tags
  const appliedTagIds = await getAppliedTagIds(payload, repo);
  await thread.edit({ appliedTags: appliedTagIds });

  // Edit the thread title if it changed
  if (payload.issue.title !== thread.name) {
    await thread.edit({ name: payload.issue.title });
  }

  // Fetch sub-issues and append them to the main post
  await appendSubIssuesToFirstMessage(repo, thread, payload.issue);

  await db
    .update(issue)
    .set({
      isGithubSynced: true,
      isDiscordSynced: true
    })
    .where(eq(issue.id, linked.id));
}
/**
 * Handles a GitHub label change (added or removed).
 * Updates the Discord thread's tags to match the current GitHub labels.
 */
async function handleLabelChange(payload: any, repo: RepositoryWithUser) {
  if (payload.issue?.pull_request) return;

  const issueId = payload.issue.id;
  const linked = await db.query.issue.findFirst({
    where: eq(issue.githubIssueId, issueId)
  });

  if (!linked) {
    console.warn(`[fallback] Creating issue for label change: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleLabelChange(payload, repo); // Retry after creation
  }

  if (!linked.discordForumPostId) {
    console.warn(`[fallback] Creating issue for label change: ${payload.issue.html_url}`);
    await handleNewIssue({ issue: payload.issue }, repo);
    return handleLabelChange(payload, repo); // Retry after creation
  }

  // Get the latest labels from the payload's issue object
  const appliedTagIds = await getAppliedTagIds(payload, repo);

  // Update the Discord thread's appliedTags
  const thread = client.getChannel(String(linked.discordForumPostId)) as ThreadChannel;
  if (thread) {
    await thread.edit({ appliedTags: appliedTagIds });
  }
}
