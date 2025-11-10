import { Toaster } from "sonner"
<<<<<<< HEAD
import { Geist, Geist_Mono } from 'next/font/google'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})
=======
>>>>>>> cb6983741932b4e80facc42d02dd920a6386a1af

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
<<<<<<< HEAD
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`} lang="pt-BR">
=======
    <>
>>>>>>> cb6983741932b4e80facc42d02dd920a6386a1af
      {children}
      <Toaster 
        position="top-center" 
        richColors 
        closeButton
        toastOptions={{
          style: {
            background: 'white',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
          },
        }}
      />
<<<<<<< HEAD
    </div>
=======
    </>
>>>>>>> cb6983741932b4e80facc42d02dd920a6386a1af
  )
}
