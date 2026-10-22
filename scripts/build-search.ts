import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';
import { createIndex, close } from 'pagefind';
import { readPublicPages } from './site-output.ts';

const root = resolve('dist');
const pages = readPublicPages(root);
try {
  const created = await createIndex({ forceLanguage: 'zh-cn', writePlayground: false });
  if (created.errors.length || !created.index) throw new Error(`Search index creation failed: ${created.errors.join('; ')}`);
  for (const page of pages) {
    const result = await created.index.addHTMLFile(page);
    if (result.errors.length) throw new Error(`Search indexing failed: ${result.errors.join('; ')}`);
  }
  const written = await created.index.writeFiles({ outputPath: resolve(root, 'pagefind') });
  if (written.errors.length) throw new Error(`Search index output failed: ${written.errors.join('; ')}`);
  unlinkSync(resolve(root, 'build-public-index.json'));
  console.log(`Indexed ${pages.length} explicitly public articles.`);
} finally {
  await close();
}
