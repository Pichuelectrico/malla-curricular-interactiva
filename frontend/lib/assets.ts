// Utility function to get correct asset paths for GitHub Pages
export function getAssetPath(path: string): string {
  // Get base URL from Vite config - use type assertion for import.meta.env
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}${cleanPath}`;
}
