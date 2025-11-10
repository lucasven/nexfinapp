import { Toaster } from "sonner"

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
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
    </>
  )
}
