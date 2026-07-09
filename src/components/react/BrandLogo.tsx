import React from 'react';

import type { PresentationAssets } from '../../lib/ui-branding';

type BrandLogoVariant = 'icon' | 'full';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
  title?: string;
  assets?: PresentationAssets;
}

const ICON_CLASS = 'h-9 w-9 object-contain';
const FULL_CLASS = 'h-6 w-auto max-w-[120px] object-contain object-left';

/** Shell chrome is light-themed (global.css color-scheme: light). Use light lockups in-app. */
const DEFAULT_ASSETS = {
  icon: {
    src: '/brand/icon-light.png',
    width: 36,
    height: 36,
  },
  full: {
    src: '/brand/wordmark-light.png',
    width: undefined as number | undefined,
    height: 24,
  },
} as const;

function resolveAssetSrc(
  variant: BrandLogoVariant,
  assets?: PresentationAssets,
): { src: string; width: number | undefined; height: number } {
  if (variant === 'icon') {
    return {
      src: assets?.icon_light ?? DEFAULT_ASSETS.icon.src,
      width: DEFAULT_ASSETS.icon.width,
      height: DEFAULT_ASSETS.icon.height,
    };
  }

  return {
    src: assets?.wordmark_light ?? DEFAULT_ASSETS.full.src,
    width: DEFAULT_ASSETS.full.width,
    height: DEFAULT_ASSETS.full.height,
  };
}

export default function BrandLogo({
  variant = 'full',
  className,
  title = 'Control Plane',
  assets,
}: BrandLogoProps) {
  const sizeClass = variant === 'icon' ? ICON_CLASS : FULL_CLASS;
  const merged = className ? `${sizeClass} ${className}` : sizeClass;
  const asset = resolveAssetSrc(variant, assets);

  return (
    <img
      src={asset.src}
      alt={title}
      className={merged}
      width={asset.width}
      height={asset.height}
      decoding="async"
      data-testid={variant === 'icon' ? 'sidebar-rail-logo' : 'brand-wordmark'}
    />
  );
}
