CREATE TABLE `comment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`github_comment_id` int,
	`discord_message_id` varchar(32),
	`issue_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`github_author_id` int,
	`github_author_name` varchar(128),
	`discord_author_id` varchar(32),
	`discord_author_name` varchar(128),
	`is_github_synced` boolean DEFAULT false,
	`is_discord_synced` boolean DEFAULT false,
	CONSTRAINT `comment_id` PRIMARY KEY(`id`),
	CONSTRAINT `comment_github_id_unique` UNIQUE(`discord_message_id`,`github_comment_id`)
);
--> statement-breakpoint
CREATE TABLE `issue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repository_id` int NOT NULL,
	`github_issue_id` int,
	`github_issue_number` int,
	`discord_forum_post_id` varchar(32),
	`first_discord_message_id` varchar(32),
	`created_at` timestamp DEFAULT (now()),
	`github_author_id` int,
	`github_author_name` varchar(128),
	`discord_author_id` varchar(32),
	`discord_author_name` varchar(128),
	`is_github_synced` boolean DEFAULT false,
	`is_discord_synced` boolean DEFAULT false,
	CONSTRAINT `issue_id` PRIMARY KEY(`id`),
	CONSTRAINT `issue_github_id_unique` UNIQUE(`discord_forum_post_id`,`github_issue_id`)
);
--> statement-breakpoint
CREATE TABLE `repository` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(256) NOT NULL,
	`github_webhook_secret` text NOT NULL,
	`discord_server_id` varchar(32) NOT NULL,
	`discord_channel_id` varchar(32) NOT NULL,
	`issue_template` text,
	`created_at` timestamp DEFAULT (now()),
	`default_labels` json,
	`user_id` int NOT NULL,
	CONSTRAINT `repository_id` PRIMARY KEY(`id`),
	CONSTRAINT `repository_discord_channel_unique` UNIQUE(`url`,`discord_channel_id`)
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repository_id` int NOT NULL,
	`github_label_id` int NOT NULL,
	`github_label_name` varchar(128) NOT NULL,
	`discord_tag_id` varchar(32),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `tag_id` PRIMARY KEY(`id`),
	CONSTRAINT `tag_repo_label_discord_unique` UNIQUE(`repository_id`,`github_label_id`,`discord_tag_id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`github_user_id` int NOT NULL,
	`github_login` varchar(32) NOT NULL,
	`github_installation_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_discord_id_unique` UNIQUE(`discord_user_id`,`github_user_id`)
);
