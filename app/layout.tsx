import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'The Edge',
  description:
    'Gain the edge over your rivals. A Fantasy Premier League planning tool built on fixtures, form and ownership.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Web Analytics. Last in the body so it can never delay the
            page: it injects a script tag and renders nothing.

            It is the app's only third-party client JavaScript, and the only
            script that is not there to make a control work. That is a real
            departure from the no-client-JS rule the rest of the app keeps, so
            it earns its place by being page-view counting and nothing else —
            no cookies, no cross-site identifier, no consent banner needed. */}
        <Analytics />
      </body>
    </html>
  )
}
