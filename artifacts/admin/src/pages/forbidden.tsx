import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Lock } from "lucide-react";
import { Link } from "wouter";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50/30 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/30">
          <Lock className="h-8 w-8 text-white" />
        </div>

        <p className="mb-3 text-[11px] font-bold tracking-[0.18em] text-red-500 uppercase">
          403 Forbidden
        </p>

        <h1 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          Access Denied
        </h1>

        <p className="mb-8 text-sm leading-relaxed text-slate-500 md:text-[15px]">
          You don't have permission to view this page. Contact a super admin to request access.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard">
            <Button className="h-11 w-full gap-2 rounded-xl px-6 sm:w-auto">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            className="h-11 w-full gap-2 rounded-xl px-6 sm:w-auto"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
