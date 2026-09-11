import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MSGSÜ Bale Programı',
    short_name: 'Bale Programı',
    description: 'MSGSÜ Bale Anasanat Dalı Haftalık Ders Programı',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFAF8',
    theme_color: '#FAFAF8',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };
}