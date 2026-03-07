import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="max-w-3xl space-y-10">

      <section className="space-y-3">
        <h2 className="text-lg font-medium">License</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Rask is licensed under the{" "}
          <strong className="text-foreground">Business Source License 1.1 (BSL 1.1)</strong>.
        </p>
        <div className="rounded-md border text-sm">
          {[
            { label: "Licensor",       value: "Agdir Drift AS" },
            { label: "Licensed Work",  value: "Rask — all versions" },
            { label: "Change License", value: "MIT License" },
            { label: "Change Date",    value: "Four years from each release date" },
          ].map(({ label, value }, i, arr) => (
            <div key={label} className={`flex gap-4 px-4 py-2.5 ${i < arr.length - 1 ? "border-b" : ""}`}>
              <span className="text-xs font-medium text-muted-foreground w-36 shrink-0">{label}</span>
              <span className="text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Free to use</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You may use, self-host, and modify Rask for personal, internal, and non-commercial purposes at no charge.
          This includes running it inside your own organisation, modifying it to fit your needs, and deploying
          it on your own infrastructure.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Commercial use requires a license</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you use Rask as part of a commercial product or service — including offering it as a managed
          or hosted service to third parties, white-labelling it, or distributing it as part of a paid product —
          you are required to obtain a commercial license.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Pricing is not published. Contact us to discuss your use case:
        </p>
        <div className="rounded-md border bg-muted/30 px-4 py-4 space-y-1 text-sm">
          <p className="font-medium">Agdir Drift AS — Commercial Licensing</p>
          <a href="mailto:sales@agdir.no" className="underline hover:text-foreground text-muted-foreground">
            sales@agdir.no
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">No warranty</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Rask is provided <strong className="text-foreground">"as is"</strong>, without warranty of any kind.
          Agdir Drift AS is not responsible for any damages, data loss, downtime, security incidents,
          or other consequences arising from the use or inability to use this software.
          You use Rask at your own risk.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We make no guarantees about correctness, uptime, compatibility with your RabbitMQ version,
          or fitness for any particular purpose. Production use is your call — assess the risks accordingly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Change date</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each version of Rask automatically converts to the MIT License four years after its release.
          At that point, all BSL restrictions on that version are lifted and it becomes fully open source.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Governing law</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These terms are governed by the laws of Norway. Agdir Drift AS is registered in Norway
          (organisasjonsnummer 928 476 895), Farsund, Agder.
        </p>
      </section>

      <div className="text-xs text-muted-foreground/60 border-t pt-4">
        Questions about licensing? Contact{" "}
        <a href="mailto:sales@agdir.no" className="underline">sales@agdir.no</a>.
        See also: <Link href="/privacy" className="underline">Privacy Policy</Link>{" "}·{" "}
        <Link href="/docs" className="underline">About Rask</Link>.
      </div>

    </div>
  );
}
