import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yönetim | MSGSÜ Ders Programı',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
