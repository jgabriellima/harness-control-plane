/**
 * Client-side navigation with Astro View Transitions when available.
 */
export async function clientNavigate(href: string): Promise<void> {
  try {
    const { navigate } = await import('astro:transitions/client');
    await navigate(href);
  } catch {
    window.location.href = href;
  }
}
