import React from 'react';

type BrandLogoVariant = 'icon' | 'full';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
}

const ICON_CLASS = 'h-9 w-9 object-contain';
const FULL_CLASS = 'h-6 w-auto max-w-[120px] object-contain object-left';

/** Shell chrome is light-themed (global.css color-scheme: light). Use light lockups in-app. */
const ASSETS = {
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

export default function BrandLogo({ variant = 'full', className }: BrandLogoProps) {
  const sizeClass = variant === 'icon' ? ICON_CLASS : FULL_CLASS;
  const merged = className ? `${sizeClass} ${className}` : sizeClass;
  const asset = ASSETS[variant];

  return (
    <img
      src={asset.src}
      alt="Jambu.ai"
      className={merged}
      width={asset.width}
      height={asset.height}
      decoding="async"
      data-testid={variant === 'icon' ? 'sidebar-rail-logo' : 'brand-wordmark'}
    />
  );
}
