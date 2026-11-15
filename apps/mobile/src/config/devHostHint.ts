export type DevelopmentHostHint = {
  hostname: string;
  allowLoopback: boolean;
};

// Web and Node/Vitest never import native Expo modules; browser previews use location.hostname.
export const getDevelopmentHostHint = (): DevelopmentHostHint | undefined => {
  const locationHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (typeof locationHost !== 'string' || !locationHost.trim()) return undefined;
  return { hostname: locationHost.trim(), allowLoopback: true };
};
