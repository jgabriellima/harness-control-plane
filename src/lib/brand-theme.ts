import type { UIConfig } from './ui-config';

export type BrandThemePack = 'open-design' | 'tailwind';

const KNOWN_THEME_PACKS: BrandThemePack[] = ['open-design', 'tailwind'];

export function resolveBrandThemePack(config: UIConfig): BrandThemePack {
  const explicit = config.presentation?.theme_pack?.trim().toLowerCase();
  if (explicit && KNOWN_THEME_PACKS.includes(explicit as BrandThemePack)) {
    return explicit as BrandThemePack;
  }

  const productId = config.metadata?.product_id?.trim().toLowerCase();
  if (productId === 'tailwind') {
    return 'tailwind';
  }

  return 'open-design';
}

export function brandThemeDataAttribute(pack: BrandThemePack): string {
  return pack === 'open-design' ? 'open-design' : pack;
}
