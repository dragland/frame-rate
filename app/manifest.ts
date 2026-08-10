import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Frame Rate',
    short_name: 'Frame Rate',
    description: 'Choose movies for your group movie night',
    // Stable app identity independent of start_url
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#111827',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Android adaptive icons mask to a circle, so this variant insets the
      // film strip into the safe zone while the gradient bleeds to the edges
      {
        src: '/maskable-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
