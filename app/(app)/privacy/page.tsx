import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl space-y-10">

      <section className="space-y-3">
        <h2 className="text-lg font-medium">The short version</h2>
        <div className="rounded-md border bg-muted/30 px-4 py-4 text-sm text-muted-foreground leading-relaxed space-y-1.5">
          <p className="flex gap-2.5"><span className="text-emerald-500 shrink-0">✓</span> Rask stores nothing about you or your usage.</p>
          <p className="flex gap-2.5"><span className="text-emerald-500 shrink-0">✓</span> No telemetry, analytics, or tracking of any kind.</p>
          <p className="flex gap-2.5"><span className="text-emerald-500 shrink-0">✓</span> No data ever leaves your server. Rask never phones home.</p>
          <p className="flex gap-2.5"><span className="text-emerald-500 shrink-0">✓</span> No account, registration, or email required.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">What is stored</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The only thing Rask writes to disk is the server configuration — your RabbitMQ host, port, and credentials —
          stored in a <code className="font-mono text-xs">.env.local</code> file on the server where you run Rask.
          This file is not committed to version control (it is listed in <code className="font-mono text-xs">.gitignore</code>),
          it is never sent to the browser, and it is never accessible from outside your server.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Nothing else is persisted anywhere. All filter states, view preferences, and UI state live in memory
          and are gone on page refresh.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your RabbitMQ data</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Queue contents, message payloads, connections, and all other broker data flow between your browser
          and your own RabbitMQ broker — proxied through the Next.js server you deploy.
          Agdir Drift AS has no access to any of it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Contact</h2>
        <p className="text-sm text-muted-foreground">Questions? Reach us at{" "}
          <a href="mailto:sales@agdir.no" className="underline hover:text-foreground">sales@agdir.no</a>.
        </p>
      </section>

      <div className="text-xs text-muted-foreground/60 border-t pt-4">
        See also: <Link href="/terms" className="underline">Terms of Use</Link>{" "}·{" "}
        <Link href="/docs" className="underline">About Rask</Link>.
        Last updated: March 2026.
      </div>

    </div>
  );
}
