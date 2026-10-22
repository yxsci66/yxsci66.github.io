import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const siteAssets = ['images/avatar.jpg', 'images/favicon.ico', 'robots.txt', 'googledb06e025310e016e.html'];

/** Prepared builds must never inherit article media from the source repository. */
export function prepareStatic(project: string): void {
  const root = resolve(project);
  const source = resolve(root, 'public');
  const cache = resolve(root, '.cache');
  const target = resolve(cache, 'static-public');
  for (const directory of [root, source, cache]) {
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new Error('Static directories cannot be links');
  }
  const files = siteAssets.map(name => {
    const file = resolve(source, name);
    let cursor = source;
    for (const part of relative(source, file).split(sep)) {
      cursor = resolve(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) throw new Error('Static assets cannot be links');
    }
    if (!lstatSync(file).isFile()) throw new Error('Missing generic static asset');
    return { file, destination: resolve(target, name) };
  });
  function verifyGeneratedTree(directory: string): void {
    if (!directory.startsWith(`${cache}${sep}`) || lstatSync(directory).isSymbolicLink()) throw new Error('Unsafe generated static path');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Generated static assets cannot contain links');
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) verifyGeneratedTree(path);
      else if (!entry.isFile()) throw new Error('Unexpected generated static asset');
    }
  }
  if (existsSync(target)) {
    verifyGeneratedTree(target);
    // Only this exact generated directory, inside the project's cache, is replaced.
    if (target !== resolve(root, '.cache', 'static-public')) throw new Error('Unsafe static output');
    rmSync(target, { recursive: true });
  }
  for (const { file, destination } of files) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.env.HARLEN_CONTENT_ROOT) {
  prepareStatic(process.cwd());
}
