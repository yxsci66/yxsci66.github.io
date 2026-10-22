# Project conventions

- Astro static site for https://yxsci66.github.io; Chinese content, Harlen's World branding.
- Node >=22.22.0, pnpm 10.33.2; keep dependency versions locked. Local caches stay on D: in this checkout.
- Run `pnpm test`, `pnpm check`, `pnpm build`, and browser checks before publishing.
- All public content consumers use `getPosts()` from `src/lib/posts.ts`; never expose drafts.
- Preserve original article text and dates. Do not copy legacy comment credentials or personal contact details into the new site.
- Use repository `.worktrees/` for isolation and `.codex/` for agent records; do not modify other worktrees.
- No subagents may spawn additional agents. The coordinator owns Git staging, commits, merging and publication.
