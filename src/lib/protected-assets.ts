import type { ProtectedAsset } from './protected-crypto';

const supported = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/zip']);
const extensions: Record<string, RegExp> = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'image/webp': /\.webp$/i, 'image/gif': /\.gif$/i, 'application/pdf': /\.pdf$/i, 'text/plain': /\.txt$/i, 'application/zip': /\.zip$/i };
export interface DecodedAsset { name: string; mime: string; blob: Blob }

export function decodeProtectedAssets(assets: ProtectedAsset[]): Map<string, DecodedAsset> {
  const decoded = new Map<string, DecodedAsset>();
  let total = 0;
  for (const asset of assets) {
    total += asset.dataBase64.length / 4 * 3 - (asset.dataBase64.endsWith('==') ? 2 : asset.dataBase64.endsWith('=') ? 1 : 0);
    if (total > 10 * 1024 * 1024) throw new Error('Protected assets exceed size limit.');
    if (!/^[a-zA-Z0-9_-]+$/.test(asset.id) || decoded.has(asset.id) || !supported.has(asset.mime)
      || !asset.name || /[\x00-\x1f\\/]/.test(asset.name) || !extensions[asset.mime]?.test(asset.name)
      || asset.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.dataBase64)) throw new Error('Invalid protected asset.');
    const bytes = Uint8Array.from(atob(asset.dataBase64), char => char.charCodeAt(0));
    decoded.set(asset.id, { name: asset.name, mime: asset.mime, blob: new Blob([bytes], { type: asset.mime }) });
  }
  return decoded;
}
