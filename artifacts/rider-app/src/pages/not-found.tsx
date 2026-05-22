import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 p-4">
      <div className="absolute top-[-20%] right-[-10%] h-72 w-72 rounded-full bg-white/[0.02]" />
      <div className="absolute bottom-[-15%] left-[-10%] h-64 w-64 rounded-full bg-green-500/[0.04]" />

      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <AlertCircle size={40} className="text-red-500" />
        </div>
        <h1 className="mb-2 text-3xl font-extrabold text-gray-900">404</h1>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-sm font-bold text-white transition-colors hover:bg-gray-800"
        >
          <ArrowLeft size={15} /> Go Home
        </Link>
      </div>
    </div>
  );
}
