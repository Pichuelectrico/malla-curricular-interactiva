export function getAssetPath(path: string): string {
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  const fileName = path.split('/').pop() || path;
  return `${baseUrl}${fileName}`;
}

export const qrCodeAsset = getAssetPath('qr-code.png');
