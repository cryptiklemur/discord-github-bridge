import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

export const repository = sqliteTable('repository', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  githubToken: text('github_token').notNull(),
  discordServerId: blob('discord_server_id', { mode: 'bigint' }).notNull(),
  discordChannelId: blob('discord_channel_id', { mode: 'bigint' }).notNull(),
  issueTemplate: text('issue_template'), // optional
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  defaultLabels: text('default_labels', {mode: 'json'}),
});

export const issue = sqliteTable('issue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').notNull(),
  githubIssueId: integer('github_issue_id').unique('issue_github_issue_id'),
  discordForumPostId: blob({ mode: 'bigint' }).unique('issue_discord_forum_post_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  githubAuthorId: integer('github_author_id'),
  githubAuthorName: text('github_author_name'),
  discordAuthorId: blob('discord_author_id', { mode: 'bigint' }),
  discordAuthorName: text('discord_author_name'),
  isGithubSynced: integer('is_github_synced', { mode: 'boolean' }).default(false),
  isDiscordSynced: integer('is_discord_synced', { mode: 'boolean' }).default(false)
});

export const comment = sqliteTable('comment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  githubCommentId: integer('github_comment_id').unique('comment_github_comment_id'),
  discordMessageId: blob('discord_message_id', { mode: 'bigint' }).unique('comment_discord_message_id'),
  issueId: integer('issue_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  githubAuthorId: integer('github_author_id'),
  githubAuthorName: text('github_author_name'),
  discordAuthorId: blob('discord_author_id', { mode: 'bigint' }),
  discordAuthorName: text('discord_author_name'),
  isGithubSynced: integer('is_github_synced', { mode: 'boolean' }).default(false),
  isDiscordSynced: integer('is_discord_synced', { mode: 'boolean' }).default(false)
});

export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').notNull(),
  githubLabelId: text('github_label_id').notNull(),
  githubLabelName: text('github_label_name').notNull(),
  discordTagId: blob('discord_tag_id', { mode: 'bigint' }), // nullable until created
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`)
});

export const repositoryRelations = relations(repository, ({ many }) => ({
  issues: many(issue),
  tags: many(tag)
}));

export const issueRelations = relations(issue, ({ one, many }) => ({
  repository: one(repository, {
    fields: [issue.repositoryId],
    references: [repository.id]
  }),
  comments: many(comment)
}));

export const commentRelations = relations(comment, ({ one }) => ({
  issue: one(issue, {
    fields: [comment.issueId],
    references: [issue.id]
  })
}));

export const tagRelations = relations(tag, ({ one }) => ({
  repository: one(repository, {
    fields: [tag.repositoryId],
    references: [repository.id]
  })
}));
