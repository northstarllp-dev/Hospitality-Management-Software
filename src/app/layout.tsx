import type { Metadata, Viewport } from 'next';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import Layout from '../components/Layout';
import SelectOnFocus from '../components/SelectOnFocus';
import { ToastProvider } from '../components/ToastProvider';

export const metadata: Metadata = {
  title: 'Havens Management',
  description: 'Hospitality management for properties, bookings, and guests.',
  applicationName: 'Havens Management',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Havens',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#2A5244',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <SelectOnFocus />
            <Layout>{children}</Layout>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
