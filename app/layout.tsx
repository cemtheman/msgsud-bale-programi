import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PullToRefresh } from '@/components/PullToRefresh';

export const metadata: Metadata = {
  title: 'MSGSÜ Ders Programı',
  description: 'MSGSÜ 2026–2027 çok sınıflı ders programı',
  appleWebApp: { 
    capable: true, 
    statusBarStyle: 'default', 
    title: 'Ders Programı'
  },
  icons: { 
    icon: '/icon.svg', 
    apple: '/apple-touch-icon.png',
  }
};

export const viewport: Viewport = {
  themeColor: '#FAFAF8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="bg-[#FAFAF8] dark:bg-[#121212] text-gray-900 dark:text-gray-100 antialiased h-full">
      <body className="min-h-full flex justify-center bg-[#FAFAF8] dark:bg-[#121212] transition-colors duration-200 overflow-x-hidden">
        <div className="w-full max-w-[480px] min-h-screen bg-[#FAFAF8] dark:bg-[#121212] flex flex-col shadow-sm border-x border-black/5 dark:border-white/10 px-4 pt-4 pb-24 overflow-x-hidden">
          <PullToRefresh>
            {children}
          </PullToRefresh>
        </div>
      </body>
    </html>
  );
}
