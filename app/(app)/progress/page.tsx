export default function ProgressPage() {
  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Progress
          </h1>
          <p className="text-lg text-gray-600">
            Track your listening and review saved items.
          </p>
        </div>

        {/* Stats Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Stats</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-600 mt-1">Listening time</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-600 mt-1">Sessions</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-600 mt-1">Streak</div>
            </div>
          </div>
        </div>

        {/* Saved Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Saved</h2>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="font-medium text-gray-900 mb-1">Words</div>
              <div className="text-sm text-gray-500">No saved words yet</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="font-medium text-gray-900 mb-1">Phrases</div>
              <div className="text-sm text-gray-500">No saved phrases yet</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="font-medium text-gray-900 mb-1">Tips</div>
              <div className="text-sm text-gray-500">No saved tips yet</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

