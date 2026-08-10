import './globals.css'
import { Inter } from 'next/font/google'
import { ErrorBoundary } from './components/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Frame Rate',
  description: 'Choose movies for your group movie night',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Frame Rate',
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