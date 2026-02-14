export default function InsightCardSkeleton() {
  return (
    <div className="px-6 py-6 animate-pulse">
      {/* Comparison cards skeleton */}
      <div className="mb-8">
        <div className="bg-gray-100 rounded-lg px-3 py-2.5 mb-2.5">
          <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-5 bg-gray-200 rounded w-32" />
        </div>
        <div className="bg-gray-100 rounded-lg px-3 py-2.5">
          <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
          <div className="h-5 bg-gray-200 rounded w-40" />
        </div>
      </div>
      
      {/* Listening tip skeleton */}
      <div className="mb-10">
        <div className="h-3 bg-gray-200 rounded w-28 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-full mb-3" />
        <div className="bg-gray-100 rounded-lg px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-48" />
        </div>
      </div>
      
      {/* In this phrase skeleton */}
      <div className="mb-10">
        <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
        <div className="bg-gray-100 rounded-lg px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-56" />
        </div>
      </div>
      
      {/* Example skeleton */}
      <div>
        <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
        <div className="bg-gray-100 rounded-lg px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-64" />
        </div>
      </div>
    </div>
  )
}
