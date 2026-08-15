import type { Metadata } from 'next';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import Layout from '../components/Layout';
import SelectOnFocus from '../components/SelectOnFocus';
import { ToastProvider } from '../components/ToastProvider';

export const metadata: Metadata = {
  title: 'Havens Management',
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
