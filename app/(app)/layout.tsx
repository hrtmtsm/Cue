import BottomNav from '@/components/BottomNav'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div 
        className="w-full min-h-full"
        style={{
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
      <BottomNav />
    </>
  )
}

