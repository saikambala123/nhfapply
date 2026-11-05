import { ShieldCheck } from "lucide-react";

export default function AuthenticateExtension({ connected = false, lastSeenAt }: { connected?: boolean; lastSeenAt?: string | null } = {}) {
  return (
    <section className="card min-w-0 p-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-teal-600" />
        <h2 className="text-[15px] font-bold">{connected ? "Extension authenticated" : "Authenticate your extension"}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Open the browser extension and click <b>Authenticate now</b>. Sign in to this dashboard and the extension connects automatically.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">After 3 days without using the extension, authenticate again to continue.</p>
      {lastSeenAt && <p className="mt-2 text-xs text-ink-faint">Last synced: {new Date(lastSeenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}

    </section>
  );
}
