import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { InferSelectModel, relations, sql } from 'drizzle-orm';

export const user = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordUserId: text('discord_user_id').notNull(),
  githubUserId: integer('github_user_id').notNull(),
  githubLogin: text('github_login').notNull(),
  githubInstallationId: integer('github_installation_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`)
});

export const repository = sqliteTable('repository', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  githubWebhookSecret: text('github_webhook_secret').notNull(),
  discordServerId: text('discord_server_id').notNull(),
  discordChannelId: text('discord_channel_id').notNull(),
  issueTemplate: text('issue_template'), // optional
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  defaultLabels: text('default_labels', { mode: 'json' }).$type<string[]>(),
  userId: integer('user_id').notNull()
});

export const issue = sqliteTable('issue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').notNull(),
  githubIssueId: integer('github_issue_id'),
  discordForumPostId: blob('discord_forum_post_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  githubAuthorId: integer('github_author_id'),
  githubAuthorName: text('github_author_name'),
  discordAuthorId: text('discord_author_id'),
  discordAuthorName: text('discord_author_name'),
  isGithubSynced: integer('is_github_synced', { mode: 'boolean' }).default(false),
  isDiscordSynced: integer('is_discord_synced', { mode: 'boolean' }).default(false)
});

export const comment = sqliteTable('comment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  githubCommentId: integer('github_comment_id'),
  discordMessageId: text('discord_message_id'),
  issueId: integer('issue_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`),
  githubAuthorId: integer('github_author_id'),
  githubAuthorName: text('github_author_name'),
  discordAuthorId: text('discord_author_id'),
  discordAuthorName: text('discord_author_name'),
  isGithubSynced: integer('is_github_synced', { mode: 'boolean' }).default(false),
  isDiscordSynced: integer('is_discord_synced', { mode: 'boolean' }).default(false)
});

export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').notNull(),
  githubLabelId: integer('github_label_id').notNull(),
  githubLabelName: text('github_label_name').notNull(),
  discordTagId: text('discord_tag_id'), // nullable until created
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`CURRENT_TIMESTAMP`)
});

export const userRelations = relations(user, ({ many }) => ({
  repositories: many(repository)
}));

export const repositoryRelations = relations(repository, ({ many, one }) => ({
  user: one(user, {
    fields: [repository.userId],
    references: [user.id]
  }),
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

export type Repository = InferSelectModel<typeof repository>;
export type User = InferSelectModel<typeof user>;
export type RepositoryWithUser = InferSelectModel<typeof repository> & { user: User };
export type Issue = InferSelectModel<typeof issue>;
export type Comment = InferSelectModel<typeof comment>;
export type Tag = InferSelectModel<typeof tag>;
