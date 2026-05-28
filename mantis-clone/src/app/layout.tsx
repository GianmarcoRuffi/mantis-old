import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mantis Clone',
  description: 'Tournament management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-indigo-700 text-white p-4 shadow-md">
          <div className="container mx-auto flex justify-between items-center">
            <Link href="/" className="text-xl font-bold">
              Mantis Clone
            </Link>
            <div className="space-x-6">
              <Link href="/" className="hover:text-indigo-200">
                Home
              </Link>
              <Link href="/tournaments" className="hover:text-indigo-200">
                Tornei
              </Link>
              <Link href="/players" className="hover:text-indigo-200">
                Giocatori
              </Link>
            </div>
          </div>
        </nav>
        <main className="container mx-auto p-8">{children}</main>
      </body>
    </html>
  )
}
