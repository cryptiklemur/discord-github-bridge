import { Message, PublicThreadChannel } from 'eris';
import { db, getRepo } from '../db/client.ts';
import { comment, FullRepository, issue } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { getClient } from './github.ts';
import { client } from '../index.js';
import {syncForum} from './sync.js';

function getLabels(repo: FullRepository, thread: PublicThreadChannel<true>) {
  const tagMap = repo.tags.reduce(
    (curr, next) => {
      curr[next.discordTagId!] = next.githubLabelName;

      return curr;
    },
    {} as Record<string, string>
  );

  return thread.appliedTags?.map((id) => tagMap[id]).filter(Boolean);
}

export async function handleNewDiscordThread(thread: PublicThreadChannel<true>) {
  let repo = await getRepo(thread.parentID!);
  repo = await syncForum(repo);
  if (!repo || !repo.user || !repo.user.githubInstallationId) {
    console.log('handleNewDiscordThread: Missing repo, user, or installation ID.');
    return;
  }

  const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repo.user.githubInstallationId);

  const first = await thread.getMessage(thread.id)!;
  if (!first?.author) {
    console.log('handleNewDiscordThread: First message author not found, retrying...');
    return setTimeout(() => handleNewDiscordThread(client.getChannel(thread.id) as PublicThreadChannel<true>), 500);
  }

  const attachmentMarkdown = first.attachments.map((a) => `![attachment](${a.url})`).join('\n');
  const body = `[Opened by @${first.author.username} on Discord](https://discord.com/channels/${repo.discordServerId}/${thread.id}):\n\n${first.content}\n\n${attachmentMarkdown}`;
  const created = await octokit.rest.issues.create({
    owner,
    repo: repoName,
    title: thread.name,
    body,
    labels: getLabels(repo, thread),
    state: thread.threadMetadata.archived ? 'closed' : 'open'
  });

  await db.insert(issue).values({
    repositoryId: repo.id,
    githubIssueId: created.data.id,
    githubIssueNumber: created.data.number,
    githubAuthorId: created.data.user?.id ?? null,
    githubAuthorName: created.data.user?.login ?? null,
    discordForumPostId: thread.id,
    firstDiscordMessageId: first.id,
    isGithubSynced: true,
    isDiscordSynced: true
  });
}

export async function handleUpdatedDiscordThread(thread: PublicThreadChannel<true>) {
  const repo = await getRepo(thread.parentID!);
  if (!repo || !repo.user || !repo.user.githubInstallationId) {
    console.log('handleUpdatedDiscordThread: Missing repo, user, or installation ID.');
    return;
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, thread.id)
  });

  if (!issueRecord?.githubIssueNumber) {
    await handleNewDiscordThread(thread);
    return handleUpdatedDiscordThread(thread);
  }

  const [owner, repoName] = repo.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repo.user.githubInstallationId);

  try {
    await octokit.rest.issues.update({
      owner,
      repo: repoName,
      title: thread.name,
      issue_number: issueRecord.githubIssueNumber,
      state: thread.threadMetadata.archived ? 'closed' : 'open',
      labels: getLabels(repo, thread)
    });
  } catch (err) {
    console.error('handleUpdatedDiscordThread: Failed to update labels:', err);
  }

  // Sync lock state
  try {
    if (thread.threadMetadata.locked || thread.threadMetadata.archived) {
      await octokit.rest.issues.lock({ owner, repo: repoName, issue_number: issueRecord.githubIssueNumber });
    } else {
      await octokit.rest.issues.unlock({ owner, repo: repoName, issue_number: issueRecord.githubIssueNumber });
    }
  } catch (err) {
    console.error('handleUpdatedDiscordThread: Failed to update lock state:', err);
  }
}

export async function handleNewDiscordMessageInThread(message: Message<PublicThreadChannel<true>>) {
  if (message.author.bot) {
    console.log('handleNewDiscordMessageInThread: Message author is a bot, ignoring.');
    return;
  }
  if (!message.channel || message.channel.type !== 11) {
    console.log('handleNewDiscordMessageInThread: Invalid or missing thread channel.');
    return; // PublicThread
  }
  const thread = message.channel as PublicThreadChannel<true>;
  const repoEntity = await getRepo(thread.parentID!);
  if (!repoEntity || !repoEntity.user || !repoEntity.user.githubInstallationId) {
    console.log('handleNewDiscordMessageInThread: Missing repo, user, or installation ID.');
    return;
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, thread.id)
  });
  if (!issueRecord?.githubIssueNumber) {
    await handleNewDiscordThread(thread);
    if (message.id == thread.id) return;
    return handleNewDiscordMessageInThread(message);
  }

  const [owner, repo] = repoEntity.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repoEntity.user.githubInstallationId);

  const attachments = message.attachments.map((a) => `![attachment](${a.url})`).join('\n');
  const commentBody = `**${message.author.username}** on Discord:\n\n${message.content}\n\n${attachments}`;
  const githubComment = await octokit.rest.issues.createComment({
    owner,
    repo: repo,
    issue_number: issueRecord.githubIssueNumber,
    body: commentBody
  });

  // Insert into comment table after successfully creating the GitHub comment
  await db.insert(comment).values({
    discordMessageId: message.id,
    githubCommentId: githubComment.data.id,
    issueId: issueRecord.id,
    createdAt: new Date(),
    githubAuthorId: githubComment.data.user?.id ?? null,
    githubAuthorName: githubComment.data.user?.login ?? null,
    discordAuthorId: message.author.id,
    discordAuthorName: message.author.username,
    isGithubSynced: true,
    isDiscordSynced: true
  });
}

export async function handleEditedDiscordMessageInThread(message: Message<PublicThreadChannel<true>>) {
  console.log('message edited');
  if (message.author.bot) {
    console.log('handleEditedDiscordMessageInThread: Message author is a bot, ignoring.');
    return;
  }
  if (!message.channel || message.channel.type !== 11) {
    console.log('handleEditedDiscordMessageInThread: Invalid or missing thread channel.');
    return;
  }
  const thread = message.channel as PublicThreadChannel<true>;
  const repoEntity = await getRepo(thread.parentID!);
  if (!repoEntity || !repoEntity.user || !repoEntity.user.githubInstallationId) {
    console.log('handleEditedDiscordMessageInThread: Missing repo, user, or installation ID.');
    return;
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, thread.id)
  });
  if (!issueRecord?.githubIssueNumber) {
    await handleNewDiscordThread(thread);
    return handleEditedDiscordMessageInThread(message);
  }

  const [owner, repo] = repoEntity.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repoEntity.user.githubInstallationId);

  const attachments = message.attachments.map((a) => `![attachment](${a.url})`).join('\n');
  const editedBody = `**${message.author.username}** (edited) on Discord:\n\n${message.content}\n\n${attachments}`;

  const existing = await db.query.comment.findFirst({
    where: eq(comment.discordMessageId, message.id)
  });

  if (!existing?.githubCommentId) {
    console.log('handleEditedDiscordMessageInThread: No matching GitHub comment found.');
    return;
  }

  await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: existing.githubCommentId,
    body: editedBody
  });
}

export async function handleDeletedDiscordMessageInThread(message: Message<PublicThreadChannel<true>>) {
  if (!message.channel || message.channel.type !== 11) {
    console.log('handleDeletedDiscordMessageInThread: Invalid or missing thread channel.');
    return;
  }
  const thread = message.channel as PublicThreadChannel<true>;
  const repoEntity = await getRepo(thread.parentID!);
  if (!repoEntity || !repoEntity.user || !repoEntity.user.githubInstallationId) {
    console.log('handleDeletedDiscordMessageInThread: Missing repo, user, or installation ID.');
    return;
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, thread.id)
  });
  if (!issueRecord?.githubIssueNumber) {
    await handleNewDiscordThread(thread);
    return handleDeletedDiscordMessageInThread(message);
  }

  const [owner, repo] = repoEntity.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repoEntity.user.githubInstallationId);

  const existing = await db.query.comment.findFirst({
    where: eq(comment.discordMessageId, message.id)
  });

  if (!existing?.githubCommentId) {
    console.log('handleDeletedDiscordMessageInThread: No matching GitHub comment found.');
    return;
  }

  await octokit.rest.issues.deleteComment({
    owner,
    repo,
    comment_id: existing.githubCommentId
  });
}

export async function handleDeletedDiscordThread(thread: PublicThreadChannel<true>) {
  const repoEntity = await getRepo(thread.parentID!);
  if (!repoEntity || !repoEntity.user || !repoEntity.user.githubInstallationId) {
    console.log('handleDeletedDiscordThread: Missing repo, user, or installation ID.');
    return;
  }

  const issueRecord = await db.query.issue.findFirst({
    where: eq(issue.discordForumPostId, thread.id)
  });

  if (!issueRecord?.githubIssueNumber) {
    console.log('handleDeletedDiscordThread: No matching GitHub issue number found.');
    return;
  }

  const [owner, repo] = repoEntity.url.replace('https://github.com/', '').split('/');
  const octokit = getClient(repoEntity.user.githubInstallationId);

  try {
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issueRecord.githubIssueNumber,
      state: 'closed',
      labels: getLabels(repoEntity, thread)
    });

    await octokit.rest.issues.lock({
      owner,
      repo,
      issue_number: issueRecord.githubIssueNumber
    });

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueRecord.githubIssueNumber,
      body: 'This issue was automatically closed and locked because the corresponding Discord post was deleted.'
    });
  } catch {
    // console.error('handleDeletedDiscordThread: Failed to close and lock GitHub issue:', err);
  }
}
