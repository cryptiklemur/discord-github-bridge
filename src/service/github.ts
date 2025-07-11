import { Octokit } from 'octokit';
import { Base64 } from 'js-base64';
import { createAppAuth } from '@octokit/auth-app';
import yaml from 'yaml';
import { FullRepository } from '../db/schema.ts';
import { OctokitOptions } from '@octokit/core/types';

export function extractLabelsFromTemplate(templateContent: string, isYaml: boolean): string[] {
  if (isYaml) {
    try {
      const parsed = yaml.parse(templateContent);
      const labels = parsed?.labels ?? [];
      return Array.isArray(labels)
        ? labels.map((l) => String(l))
        : typeof labels === 'string'
          ? labels.split(',').map((l) => l.trim())
          : [];
    } catch {
      return [];
    }
  }

  // Markdown: parse frontmatter block
  const match = templateContent.match(/^---\s*([\s\S]*?)\s*---/);
  if (!match) return [];

  try {
    const frontmatter = yaml.parse(match[1]);
    const labels = frontmatter?.labels ?? [];
    return Array.isArray(labels)
      ? labels.map((l) => String(l))
      : typeof labels === 'string'
        ? labels.split(',').map((l) => l.trim())
        : [];
  } catch {
    return [];
  }
}

export async function fetchIssueTemplate(
  repoEntity: FullRepository
): Promise<{ content: string | null; defaultLabels: string[]; isYaml: boolean }> {
  const octokit = getClient(repoEntity.user.githubInstallationId);
  if (!repoEntity.issueTemplate) {
    return { content: null, defaultLabels: [], isYaml: false };
  }

  const match = repoEntity.url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub repository URL: ${repoEntity.url}`);

  const [, owner, repo] = match;
  const extensions = ['.md', '.yml', '.yaml'];

  for (const ext of extensions) {
    try {
      const res = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: `.github/ISSUE_TEMPLATE/${repoEntity.issueTemplate}${ext}`
      });

      if (!('content' in res.data)) continue;
      const content = Base64.decode(res.data.content as string);
      const isYaml = ext.endsWith('yml') || ext.endsWith('yaml');
      const defaultLabels = extractLabelsFromTemplate(content, isYaml);

      return { content, defaultLabels, isYaml };
    } catch (err: any) {
      if (err.status !== 404) console.warn(`Error fetching ${repoEntity.issueTemplate}${ext}:`, err);
    }
  }

  return { content: null, defaultLabels: [], isYaml: false };
}

export async function fetchLabels(repoEntity: FullRepository) {
  const octokit = getClient(repoEntity.user.githubInstallationId);
  const match = repoEntity.url.match(/github\.com\/([^/]+)\/([^/]+)/);
  const [, owner, repo] = match!;
  const labels = await octokit.rest.issues.listLabelsForRepo({ owner, repo });

  return labels.data.map((label: any) => ({
    id: label.id,
    name: label.name,
    color: label.color
  }));
}

export function parseYamlIssueTemplate(yamlContent: string): string {
  const doc = yaml.parse(yamlContent);

  if (!doc || !Array.isArray(doc.body)) {
    return '_Invalid or unsupported YAML issue template._';
  }

  const parts: string[] = [];

  for (const item of doc.body) {
    if (item.type === 'markdown') {
      parts.push(item.attributes?.value ?? '');
    } else if (item.type === 'input' || item.type === 'textarea') {
      const label = item.attributes?.label ?? 'Untitled Field';
      parts.push(`### ${label}\n\n<!-- Your response here -->\n`);
    } else if (item.type === 'dropdown') {
      const label = item.attributes?.label ?? 'Untitled Dropdown';
      const options = item.attributes?.options?.map((opt: any) => `- ${opt.label ?? opt}`).join('\n') ?? '';
      parts.push(`### ${label}\n\n${options}\n`);
    } else if (item.type === 'checkboxes') {
      const label = item.attributes?.label ?? 'Checklist';
      const options = item.attributes?.options?.map((opt: any) => `- [ ] ${opt.label ?? opt}`).join('\n') ?? '';
      parts.push(`### ${label}\n\n${options}\n`);
    }
  }

  return parts.join('\n');
}

const WEBHOOK_DOMAIN = (process.env.WEBHOOK_DOMAIN ?? 'https://dgb.le.mr/').replaceAll(/\/$/gm, '');

export async function createOrUpdateWebhookIfMissing(repoEntity: FullRepository): Promise<boolean> {
  const match = repoEntity.url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${repoEntity.url}`);
  const [, owner, repo] = match;

  const octokit = getClient(repoEntity.user.githubInstallationId);
  const webhookUrl = WEBHOOK_DOMAIN.trimEnd() + '/github/webhook';

  // Check existing hooks
  const hooks = await octokit.rest.repos.listWebhooks({ owner, repo });

  const alreadyExists = hooks.data.some((hook) => hook.config?.url === webhookUrl);

  if (alreadyExists) {
    // console.log(`[GitHub] Webhook already exists for ${owner}/${repo}`);
    return false;
  }

  // Create webhook
  await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: 'json',
      secret: repoEntity.githubWebhookSecret,
      insecure_ssl: '0'
    },
    events: ['issues', 'issue_comment'],
    active: true
  });

  console.log(`[GitHub] Webhook created for ${owner}/${repo}`);
  return true;
}

export function getClient(installationId?: number): Octokit {
  const auth: OctokitOptions['auth'] = {
    appId: process.env.GITHUB_APP_ID!,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, 'base64').toString('utf8')
  };
  if (installationId) {
    auth.installationId = installationId;
  }

  return new Octokit({ authStrategy: createAppAuth, auth });
}
