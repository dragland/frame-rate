import './globals.css'
import { Inter } from 'next/font/google'
import { ErrorBoundary } from './components/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Frame Rate',
  description: 'Choose movies for your group movie night',
  appleWebApp: {
    capable: true,
    // 'black' (opaque), not 'black-translucent': the layout has no
    // safe-area-inset handling, so content must not draw under the notch
    statusBarStyle: 'black',
    title: 'Frame Rate',
  },
  // Next 16 emits only the standards-track mobile-web-app-capable tag, but
  // iOS standalone mode still keys off the Apple-specific one (vercel/next.js#70272)
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#111827',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  )
} 