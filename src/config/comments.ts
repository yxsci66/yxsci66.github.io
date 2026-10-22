// Real GitHub Discussions identifiers. An incomplete configuration keeps comments
// hidden without network requests; giscus installation is managed separately.
export const comments = {
  repo: 'yxsci66/yxsci66.github.io',
  repoId: 'R_kgDOHiCU-Q',
  category: 'Announcements',
  categoryId: 'DIC_kwDOHiCU-c4DJWtM',
};

export function validCommentsConfig(config: typeof comments): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(config.repo) && /^R_[A-Za-z0-9_-]+$/.test(config.repoId)
    && /^DIC_[A-Za-z0-9_-]+$/.test(config.categoryId) && config.category.trim().length > 0;
}
