ALTER TABLE `comment` MODIFY COLUMN `github_comment_id` varchar(128);--> statement-breakpoint
ALTER TABLE `comment` MODIFY COLUMN `github_author_id` varchar(128);--> statement-breakpoint
ALTER TABLE `issue` MODIFY COLUMN `github_issue_id` varchar(128);--> statement-breakpoint
ALTER TABLE `issue` MODIFY COLUMN `github_author_id` varchar(128);--> statement-breakpoint
ALTER TABLE `tag` MODIFY COLUMN `github_label_id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `user` MODIFY COLUMN `github_user_id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `user` MODIFY COLUMN `github_installation_id` varchar(128) NOT NULL;