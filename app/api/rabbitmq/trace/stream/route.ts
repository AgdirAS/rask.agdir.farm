import { type NextRequest } from "next/server";
import { getConnectionConfig } from "@/lib/env";
import type { TraceEvent } from "@/lib/types";
import * as amqp from "amqplib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vhost = req.nextUrl.searchParams.get("vhost") ?? "/";
  const config = getConnectionConfig();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: TraceEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { closed = true; }
      }

      function sendHeartbeat() {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { closed = true; }
      }

      let amqpConn: amqp.ChannelModel | null = null;
      let amqpChannel: amqp.Channel | null = null;

      try {
        const amqpHost = new URL(config.managementUrl).hostname;
        const amqpUrl = `amqp://${config.user}:${encodeURIComponent(config.password)}@${amqpHost}:${config.amqpPort}/${encodeURIComponent(vhost)}`;
        amqpConn = await amqp.connect(amqpUrl) as amqp.ChannelModel;
        amqpChannel = await amqpConn.createChannel();

        const q = await amqpChannel.assertQueue("", { exclusive: true, autoDelete: true });
        await amqpChannel.bindQueue(q.queue, "amq.rabbitmq.trace", "#");

        const ch = amqpChannel;
        const result = await ch.consume(q.queue, (msg) => {
          if (!msg || closed) return;
          try {
            const routingKey = msg.fields.routingKey;
            const isPublish = routingKey.startsWith("publish.");
            const isDeliver = routingKey.startsWith("deliver.");

            const headers = (msg.properties.headers ?? {}) as Record<string, Buffer | string | unknown>;
            const rawExchange = headers["exchange_name"];
            const exchange = Buffer.isBuffer(rawExchange) ? rawExchange.toString() : (typeof rawExchange === "string" ? rawExchange : "");

            const routingKeys = headers["routing_keys"] as unknown[] | undefined;
            const rk = Array.isArray(routingKeys) && routingKeys.length > 0
              ? (Buffer.isBuffer(routingKeys[0]) ? (routingKeys[0] as Buffer).toString() : String(routingKeys[0]))
              : routingKey;

            let payload = "";
            let payloadEncoding: "string" | "base64" = "string";
            try {
              payload = msg.content.toString("utf-8");
            } catch {
              payload = msg.content.toString("base64");
              payloadEncoding = "base64";
            }

            const event: TraceEvent = {
              type: isPublish ? "publish" : isDeliver ? "deliver" : "drop",
              exchange,
              queue: isDeliver ? routingKey.slice("deliver.".length) : undefined,
              routingKey: rk,
              vhost,
              payload: payload.slice(0, 512),
              payloadEncoding,
              properties: msg.properties as unknown as Record<string, unknown>,
              timestamp: Date.now(),
            };
            send(event);
          } catch { /* skip malformed */ }
          ch.ack(msg);
        });

        const consumerTag = result.consumerTag;
        const heartbeat = setInterval(sendHeartbeat, 15_000);

        req.signal.addEventListener("abort", async () => {
          closed = true;
          clearInterval(heartbeat);
          try {
            await ch.cancel(consumerTag);
            await ch.close();
            if (amqpConn) await amqpConn.close();
          } catch { /* already closed */ }
          try { controller.close(); } catch { /* already closed */ }
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "AMQP connection failed";
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`));
          controller.close();
        } catch { /* ignore */ }
        closed = true;
        // Cleanup on connection error
        try { if (amqpChannel) await amqpChannel.close(); } catch { /* ignore */ }
        try { if (amqpConn) await amqpConn.close(); } catch { /* ignore */ }
      }
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
