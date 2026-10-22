# Private editorial system contract

Approved 2026-10-23. Keep the existing Astro site, URLs and design. No rented server. Pages CMS hosted UI, manual cloud save, GitHub private content and Actions publishing; giscus only on public posts. GitHub and Pages CMS are trusted processors, not end-to-end encrypted storage.

## Repositories and ownership

- Public code: `yxsci66/yxsci66.github.io`, main. Generated public output: `site-release` branch. Existing five articles stay public until explicitly changed.
- Private content: `yxsci66/harlen-blog-content`, main. `posts/<id>.md`, `media/`, `manage/<id>.json`, `access/<id>.json`, immutable release snapshots and ledger. New authoring posts default to `visibility: private`.
- Root owns package.json, lockfile, this contract, integration docs, all Git/remote operations. T2 owns scripts/cms/**, tests/cms*.test.ts, src/lib/protected-crypto.ts, both publishing workflows and all private repository implementation. T3 owns other src/**, public/** and tests/e2e/editorial*.spec.ts plus tests/visibility*.test.ts. No agent stages/commits/pushes or spawns agents. Build outputs must not be written concurrently.

## Article model and published inputs

Authoring frontmatter retains title, description, pubDate, updatedDate, category, tags, featured, legacyPaths; adds `articleId` UUID, `slug` stable legacy slug, `visibility: public | unlisted | password | private`, `commentsEnabled` boolean. New title/body drafts may be incomplete; publish validates required metadata. Legacy local fixtures default public and articleId defaults to slug for backward compatibility. Existing draft:true always excludes an article.

T2 prepares a directory and sets `HARLEN_CONTENT_ROOT` to its absolute path. It contains:

- `posts/*.md`: only public/unlisted selected immutable snapshots, retaining slug filenames and articleId.
- `protected.json`: array `{ id: string, payloadUrl: string }`, no title or source metadata. Protected IDs are UUIDs. URL `/locked-assets/<id>.json`.
- `public/`: only referenced public/unlisted media and protected encrypted envelopes. Finalizer copies this into dist with collision/path checks before export. It must not include original private files.

`HARLEN_PRODUCTION=1` makes absence/incompleteness of HARLEN_CONTENT_ROOT fatal. Local public source fixtures remain usable for development and PR tests. No production fallback to old sample posts. `getPosts()` returns public, non-draft posts for every list, taxonomy, RSS, sitemap and adjacent-post navigation. `getRoutablePosts()` returns public/unlisted for readable routes. Locked pages have separate routes `/locked/<id>/`. Unlisted and locked are noindex, absent from every discovery mechanism and have no comments. A zero-public-post site must yield an empty search index, not an all-page fallback.

## Cryptographic interface (owned by T2, consumed by T3)

`src/lib/protected-crypto.ts` must be browser-compatible (no Node imports), exporting types and functions:

```ts
export interface ProtectedAsset { id: string; name: string; mime: string; dataBase64: string }
export interface ProtectedArticle { version: 1; id: string; title: string; description: string; html: string; tags: string[]; category?: string; pubDate: string; updatedDate?: string; assets: ProtectedAsset[] }
export interface ProtectedEnvelope { version: 1; kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: 600000; salt: string }; cipher: { name: 'AES-GCM'; iv: string }; ciphertext: string }
export function encryptProtectedArticle(article: ProtectedArticle, password: string): Promise<ProtectedEnvelope>;
export function decryptProtectedArticle(envelope: ProtectedEnvelope, password: string, expectedId: string): Promise<ProtectedArticle>;
```

Base64 is standard RFC4648. Salt=16 random bytes, IV=12 random bytes, AES key=256 bits, GCM tag=128 bits, AAD=UTF8 `harlen-world:protected:v1:<id>`. Validate version/algorithm/iterations and decoded lengths before key derivation; use fatal UTF8 decoding and schema checks after decryption. Reject mismatched IDs and duplicate asset IDs. Maximum plaintext raw media sum 10 MiB (additional envelope/base64 overhead allowed with a bounded maximum). Password generated from 16 random bytes base64url; independent private access record, no passwords in action inputs/logs/frontmatter/public output.

Protected sanitized HTML uses `harlen-asset:<asset-id>` in image src / attachment href. Client replaces only validated references with local Blob URLs, sanitizes before DOM insertion, disallows script/iframes and external image/media loads, revokes URLs on relock/pagehide. Password stays in memory, no URL or persistent storage. Protected title/description/tags are also encrypted. Supported raw media: JPEG, PNG, WebP, GIF; PDF, TXT, ZIP as downloads, never executable embeds. Reject missing or external protected media and cross-visibility sharing with publicly exported identical media. Previous public versions cannot be made secret retroactively.

## Publishing behavior

CMS writes only posts/media. Small private sync on save creates/refreshes readonly manage records (no body/password); separate readonly access collection displays passwords and offers normal selection/copy. Actions attach to manage entries, never body/access entries: publish, withdraw, rotate-password, restore; root action rebuilds current published content. CMS readonly is accidental-edit prevention, private repo permissions are the actual authorization boundary.

Private workflow reads authoritative saved Git data using validated IDs/paths and immutable commit/blob references, never trusts context.data body supplied by CMS. Each publication updates only the selected article snapshot and pinned referenced media. Save/visibility edits never change live content until the explicit action succeeds. Rotation uses the current published version rather than an unpublished draft. Restore selects a previous snapshot while retaining current visibility/password.

Serialize the whole publication transaction with one concurrency group, queue:max and cancel-in-progress:false. Reject stale source preconditions, stale per-article operation sequence and duplicate requests; persist pending release state for reconciliation. Build/export checks run privately. Only safe dist gets committed to public site-release; scoped PUBLISH_TOKEN (public repo contents/actions write only) dispatches public main workflow with exact release SHA. Public workflow validates SHA/ref and uploads static contents without reading private source or executing files from the release. Wait for exact public deployment success before marking online state. Reconcile a previously successful deployment after an interrupted private transaction. Failure keeps/reconciles the actual online version rather than falsely marking success. No force-push or history rewrite.

Public main PR/push validates fixture builds only; root CMS rebuild action applies public code changes to existing published snapshots. Avoid exposing private source refs/content in public log messages. Actions credentials only in private secrets. Never upload workspaces or private plaintext screenshots as public artifacts.

## Acceptance

Preserve five original articles, dates and old routes. Tests cover manual save vs publish, independent drafts, stale/repeated/queued requests, failure reconciliation, immutable media, restore preserving access, crypto roundtrip/wrong password/tampering/rotation, all four visibility modes and zero public posts, unique private canary data absent from every public file/index/meta/artifact, attachment validation, safe HTML, mobile unlock/relock, long-content control actions, and giscus disabled for every nonpublic mode. No real public test comments. Hosted CMS acceptance needs the owner's GitHub App authorization and cross-device save verification. No paid services or billing changes.

## Task ledger

T1 root: worktree, interfaces, dependency preparation and seed mapping. T2 implementation agent gpt-6.1-sol/high: publishing + private CMS. T3 implementation agent gpt-6.1-sol/high: public routing/unlock/comments. T4 gpt-6-astra/high: independent review after T2/T3. T5 root: integration, meaningful checks, concrete auth setup, migration and deployment. Investigation agents github_cms_feasibility and github_privacy_architecture completed read-only feasibility before implementation.
