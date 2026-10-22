# Harlen's World implementation plan

Approved in conversation on 2026-10-22; user explicitly requested implementation.

## Requirements

- Personal homepage and full static blog, Chinese, warm paper/ink/terracotta design.
- Brand Harlen's World; subtitle 重度文青，搬砖码农. GitHub-only contact.
- Astro + Markdown + Pagefind + RSS + sitemap + GitHub Actions → https://yxsci66.github.io/.
- Home, blog list/article, archives, tags/categories, search, projects, about, 404. Responsive, keyboard accessible; article TOC/code copying/previous-next links.
- Preserve four complete HTML articles and firstblog note, all dates/categories/tags/text/code; optimize local images and preserve legacy article links.
- No CMS, comments, analytics or custom domain. Preserve both original repositories' uncommitted changes.

## Tasks and ownership

| ID | Owner | Model / reasoning | Depends on | Exclusive write scope | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T1 | coordinator | current session | none | worktree, scaffold, shared schema/config/helpers | locked compatible toolchain; publication unit tests |
| T2 | site_ui | gpt-6.1-sol / medium | T1 | src/components, src/layouts, src/styles, page UI and e2e UI tests | complete warm responsive site; accessible navigation and reading |
| T3 | audit_pages_repo | gpt-6-luna / medium | T1 | src/content/blog, public/images | five source-faithful entries, working images and legacyPaths |
| T4 | site_delivery | gpt-6.1-sol / medium | T2,T3 | Feed, redirects, build/indexing, workflow, maintenance docs, delivery tests | local production build and automated deployment pipeline |
| T5 | site_review | gpt-6.1-sol / high | T4 | read-only | content/routes/drafts/build review; fixes returned to owners |
| T6 | coordinator | current session | T5 and fixes | final integration, Git and publication | checks, browser QA, merged main, successful Actions deployment and HTTPS |

T2 and T3 run in parallel. Workers do not commit/stage/push or spawn other agents. Existing R1/R2 audit research is reused.

## Shared interface

Blog fields: title:string, description:string, pubDate:Date, updatedDate?:Date, category?:string, tags:string[]=[], draft:boolean=false, featured:boolean=false, legacyPaths:string[]=[]. Files determine slug. All public consumers use getPosts(); postUrl(post) produces /blog/<id>/; formatDate renders in Asia/Shanghai.

## Verification

pnpm install --frozen-lockfile; pnpm test; pnpm check; pnpm build; pnpm test:e2e.
Compare migrated bodies, code blocks and dates to old HTML; exercise old URLs, search Chinese/English/no-results, mobile menu, RSS, sitemap and draft exclusion. Final GitHub Actions must succeed and live HTTPS pages/search must work.
