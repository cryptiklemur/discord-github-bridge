CREATE TABLE `comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_comment_id` integer,
	`discord_message_id` text,
	`issue_id` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`github_author_id` integer,
	`github_author_name` text,
	`discord_author_id` text,
	`discord_author_name` text,
	`is_github_synced` integer DEFAULT false,
	`is_discord_synced` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `issue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`github_issue_id` integer,
	`github_issue_number` integer,
	`discord_forum_post_id` blob,
	`first_discord_message_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`github_author_id` integer,
	`github_author_name` text,
	`discord_author_id` text,
	`discord_author_name` text,
	`is_github_synced` integer DEFAULT false,
	`is_discord_synced` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`github_webhook_secret` text NOT NULL,
	`discord_server_id` text NOT NULL,
	`discord_channel_id` text NOT NULL,
	`issue_template` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`default_labels` text,
	`user_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`github_label_id` integer NOT NULL,
	`github_label_name` text NOT NULL,
	`discord_tag_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_user_id` text NOT NULL,
	`github_user_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`github_installation_id` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
