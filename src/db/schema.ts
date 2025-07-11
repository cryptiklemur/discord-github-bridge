import { boolean, int, json, mysqlTable, varchar, timestamp, uniqueIndex, text } from 'drizzle-orm/mysql-core';
import { InferSelectModel, relations } from 'drizzle-orm';

export const user = mysqlTable(
  'user',
  {
    id: int('id').primaryKey().autoincrement(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    githubUserId: int('github_user_id').notNull(),
    githubLogin: varchar('github_login', { length: 32 }).notNull(),
    githubInstallationId: int('github_installation_id').notNull(),
    createdAt: timestamp('created_at').defaultNow()
  },
  (table) => [uniqueIndex('user_discord_id_unique').on(table.discordUserId, table.githubUserId)]
);

export const repository = mysqlTable(
  'repository',
  {
    id: int('id').primaryKey().autoincrement(),
    url: varchar('url', { length: 256 }).notNull(),
    githubWebhookSecret: text('github_webhook_secret').notNull(),
    discordServerId: varchar('discord_server_id', { length: 32 }).notNull(),
    discordChannelId: varchar('discord_channel_id', { length: 32 }).notNull(),
    issueTemplate: text('issue_template'), // optional
    createdAt: timestamp('created_at').defaultNow(),
    defaultLabels: json('default_labels').$type<string[]>(),
    userId: int('user_id').notNull()
  },
  (table) => [uniqueIndex('repository_discord_channel_unique').on(table.url, table.discordChannelId)]
);

export const issue = mysqlTable(
  'issue',
  {
    id: int('id').primaryKey().autoincrement(),
    repositoryId: int('repository_id').notNull(),
    githubIssueId: int('github_issue_id'),
    githubIssueNumber: int('github_issue_number'),
    discordForumPostId: varchar('discord_forum_post_id', { length: 32 }),
    firstDiscordMessageId: varchar('first_discord_message_id', { length: 32 }),
    createdAt: timestamp('created_at').defaultNow(),
    githubAuthorId: int('github_author_id'),
    githubAuthorName: varchar('github_author_name', { length: 128 }),
    discordAuthorId: varchar('discord_author_id', { length: 32 }),
    discordAuthorName: varchar('discord_author_name', { length: 128 }),
    isGithubSynced: boolean('is_github_synced').default(false),
    isDiscordSynced: boolean('is_discord_synced').default(false)
  },
  (table) => [uniqueIndex('issue_github_id_unique').on(table.discordForumPostId, table.githubIssueId)]
);

export const comment = mysqlTable(
  'comment',
  {
    id: int('id').primaryKey().autoincrement(),
    githubCommentId: int('github_comment_id'),
    discordMessageId: varchar('discord_message_id', { length: 32 }),
    issueId: int('issue_id').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    githubAuthorId: int('github_author_id'),
    githubAuthorName: varchar('github_author_name', { length: 128 }),
    discordAuthorId: varchar('discord_author_id', { length: 32 }),
    discordAuthorName: varchar('discord_author_name', { length: 128 }),
    isGithubSynced: boolean('is_github_synced').default(false),
    isDiscordSynced: boolean('is_discord_synced').default(false)
  },
  (table) => [uniqueIndex('comment_github_id_unique').on(table.discordMessageId, table.githubCommentId)]
);

export const tag = mysqlTable(
  'tag',
  {
    id: int('id').primaryKey().autoincrement(),
    repositoryId: int('repository_id').notNull(),
    githubLabelId: int('github_label_id').notNull(),
    githubLabelName: varchar('github_label_name', { length: 128 }).notNull(),
    discordTagId: varchar('discord_tag_id', { length: 32 }), // nullable until created
    createdAt: timestamp('created_at').defaultNow()
  },
  (table) => [
    uniqueIndex('tag_repo_label_discord_unique').on(table.repositoryId, table.githubLabelId, table.discordTagId)
  ]
);

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
export type FullRepository = InferSelectModel<typeof repository> & { user: User } & { tags: Tag[] };
export type Issue = InferSelectModel<typeof issue>;
export type Comment = InferSelectModel<typeof comment>;
export type Tag = InferSelectModel<typeof tag>;
