import Link from "next/link";
import { ExternalLink } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="max-w-3xl space-y-10">

      <section className="space-y-3">
        <h2 className="text-lg font-medium">What is Rask?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Named after <em>Ratatoskr</em> — the Norse messenger squirrel who ran between the roots of Yggdrasil
          carrying messages — Rask is a modern management dashboard for RabbitMQ. Built by{" "}
          <a href="https://agdir.no" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            Agdir Drift AS
          </a>
          {" "}(Krøgenes Bryggevei 19, 4841 Arendal, Norway) because the native RabbitMQ management UI has not kept
          pace with how operators actually work. We use it in production ourselves, every day.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Rask is a drop-in replacement for the built-in RabbitMQ management plugin UI. It adds real-time tracing,
          topology visualisation, a publishing tool, and a cleaner information hierarchy — while keeping full access
          to every underlying RabbitMQ management API capability.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Architecture</h2>
        <p className="text-sm text-muted-foreground">
          All RabbitMQ Management HTTP API calls are proxied through Next.js API routes.
          The browser never talks to RabbitMQ directly — this simplifies auth, CORS, and lets you run
          Rask inside a private network without exposing port 15672.
        </p>
        <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono leading-relaxed">
          {`Browser → Next.js API Routes (/api/rabbitmq/*)
        → RabbitMQ Management API (port 15672)
        → RabbitMQ AMQP (port 5672, server-only via amqplib)`}
        </pre>
        <p className="text-sm text-muted-foreground">
          AMQP operations (peek, publish, purge) are performed server-side using <code className="font-mono text-xs">amqplib</code>.
          This library is never imported in client components.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configuration</h2>
        <p className="text-sm text-muted-foreground">
          All environment variables are optional. The defaults work with a local RabbitMQ instance
          started with default settings (e.g. <code className="font-mono text-xs">docker run -p 5672:5672 -p 15672:15672 rabbitmq:management</code>).
        </p>
        <div className="rounded-md border text-sm">
          {[
            { name: "RABBITMQ_HOST",            default: "localhost",  note: "Hostname or IP of your RabbitMQ broker" },
            { name: "RABBITMQ_MANAGEMENT_PORT", default: "15672",      note: "RabbitMQ management HTTP API port" },
            { name: "RABBITMQ_AMQP_PORT",        default: "5672",       note: "AMQP port (used server-side only)" },
            { name: "RABBITMQ_USER",             default: "guest",      note: "Broker user for management API" },
            { name: "RABBITMQ_PASSWORD",         default: "guest",      note: "Broker password" },
            { name: "RABBITMQ_VHOST",            default: "/",          note: "Default virtual host" },
          ].map(({ name, default: def, note }, i, arr) => (
            <div key={name} className={`px-4 py-2.5 ${i < arr.length - 1 ? "border-b" : ""}`}>
              <div className="flex items-center gap-4">
                <code className="font-mono text-xs flex-1 text-foreground">{name}</code>
                <span className="text-xs text-muted-foreground font-mono">default: <code>{def}</code></span>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Multi-environment</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Rask supports switching between multiple RabbitMQ environments via a symlink-based{" "}
          <code className="font-mono text-xs">.env.local</code> switcher.
          When no environment is active, a full-screen overlay lets you configure or activate one.
          The active environment is session-cached to avoid repeated file reads.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">License</h2>
        <div className="rounded-md border bg-muted/30 px-4 py-4 text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>
            Rask is released under the{" "}
            <strong className="text-foreground">Business Source License 1.1 (BSL)</strong>.
            You may use, self-host, and modify Rask for personal, internal, and non-commercial purposes at no charge.
          </p>
          <p>
            Commercial use — including offering Rask as a hosted service or embedding it in a commercial product — requires
            a separate commercial agreement. To inquire, contact{" "}
            <a href="mailto:sales@agdir.no" className="underline hover:text-foreground">sales@agdir.no</a>.
          </p>
          <p>
            See the full terms at{" "}
            <Link href="/terms" className="underline hover:text-foreground">Terms of Use</Link>.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Privacy</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Rask collects no telemetry and sends no data outside your own infrastructure. All communication is between
          your browser, the Rask Next.js server, and your RabbitMQ broker. See{" "}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>{" "}
          for details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Links</h2>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {[
            { href: "https://github.com/AgdirAS/rask",     label: "GitHub — AgdirAS/rask" },
            { href: "https://agdir.no",                        label: "Agdir Drift AS — agdir.no" },
            { href: "https://www.rabbitmq.com/docs",           label: "RabbitMQ Documentation" },
          ].map(({ href, label }) => (
            <li key={href} className="flex items-center gap-1.5">
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground flex items-center gap-1">
                {label} <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
