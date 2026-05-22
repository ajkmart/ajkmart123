function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className || ""}`} />;
}

export function SkeletonHome() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28 !bg-white/10" />
            <SkeletonBlock className="h-6 w-36 !bg-white/10" />
          </div>
          <SkeletonBlock className="h-10 w-24 rounded-2xl !bg-white/10" />
        </div>
        <SkeletonBlock className="h-20 w-full rounded-2xl !bg-white/[0.06]" />
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-[72px] rounded-2xl !bg-white/[0.06]" />
          ))}
        </div>
      </div>
      <div className="space-y-3 px-4 pt-4">
        <SkeletonBlock className="h-14 rounded-3xl" />
        <SkeletonBlock className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}
