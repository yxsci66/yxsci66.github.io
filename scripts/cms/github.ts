import { execFileSync } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git } from './repository.ts';
import { requireValue } from './content.ts';

export class PublicPublisher {
  private token: string;
  private repository: string;
  private localRelease?: { root: string; sha: string };
  constructor(repository: string, token: string) {
    requireValue(repository === 'yxsci66/yxsci66.github.io' && token, 'Scoped publishing credential and expected repository required');
    this.repository = repository; this.token = token;
  }
  private env(): NodeJS.ProcessEnv {
    return { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${this.token}`).toString('base64')}`, GIT_TERMINAL_PROMPT: '0' };
  }
  private async api(endpoint: string, body?: unknown, allow404 = false): Promise<any> {
    const response = await fetch(`https://api.github.com/repos/${this.repository}/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && allow404) return null;
    requireValue(response.ok, `Public deployment API failed (${response.status}); no private details logged`);
    return response.status === 204 ? null : response.json();
  }
  /** Creates a local fast-forward commit. Public push occurs only after the private SHA checkpoint. */
  async createRelease(dist: string): Promise<string> {
    const root = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'harlen-safe-release-'));
    git(root, ['init', '--initial-branch=site-release']);
    git(root, ['remote','add','origin',`https://github.com/${this.repository}.git`]);
    const previous = await this.api('git/ref/heads/site-release', undefined, true);
    if (previous) {
      git(root, ['fetch','--depth=1','origin','refs/heads/site-release'], this.env());
      git(root, ['update-ref','refs/heads/site-release',previous.object.sha]);
      git(root, ['read-tree','--empty']);
    }
    await cp(dist, root, { recursive: true, force: false, errorOnExist: false });
    git(root, ['add','--all']);
    git(root, ['-c','user.name=Harlen editorial','-c','user.email=editorial@users.noreply.github.com','commit','--allow-empty','-m','chore: publish validated static release']);
    const sha = git(root, ['rev-parse','HEAD']);
    this.localRelease = { root, sha };
    return sha;
  }
  /** Idempotently finds or dispatches the public workflow named by the exact immutable release SHA. */
  async deploy(sha: string): Promise<'success' | 'failure'> {
    requireValue(/^[0-9a-f]{40}$/.test(sha), 'Invalid release SHA');
    if (this.localRelease?.sha === sha) git(this.localRelease.root, ['push','origin',`${sha}:refs/heads/site-release`], this.env());
    const ref = await this.api('git/ref/heads/site-release', undefined, true);
    // A checkpoint may exist without a push after runner termination. No deployment occurred in that window.
    if (!ref || ref.object.sha !== sha) return 'failure';
    const title = `Safe deployment ${sha}`;
    let run: any;
    const findRun = async () => {
      for (let page = 1; page <= 10; page++) {
        const data = await this.api(`actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`);
        const match = data.workflow_runs.find((item: any) => item.display_title === title && item.head_branch === 'main');
        if (match || data.workflow_runs.length < 100) return match;
      }
      throw new Error('Deployment history lookup exceeded safe bound');
    };
    run = await findRun();
    if (!run) await this.api('actions/workflows/pages.yml/dispatches', { ref: 'main', inputs: { release_sha: sha } });
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      if (!run) run = await findRun();
      else run = await this.api(`actions/runs/${run.id}`);
      if (run?.status === 'completed') return run.conclusion === 'success' ? 'success' : 'failure';
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    throw new Error('Deployment still pending; next operation will reconcile exact release');
  }
}

export function buildSite(codeRoot: string, contentRoot: string): void {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(executable, ['build'], { cwd: codeRoot, env: { ...process.env, HARLEN_CONTENT_ROOT: contentRoot, HARLEN_PRODUCTION: '1', ASTRO_TELEMETRY_DISABLED: '1' }, stdio: 'inherit', shell: process.platform === 'win32' });
}
