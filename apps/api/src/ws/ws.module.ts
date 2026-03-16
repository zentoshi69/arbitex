import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Module, Injectable } from "@nestjs/common";
import { Server, type Socket } from "socket.io";
import * as jose from "jose";
import { config } from "@arbitex/config";
import type { WsEventMap } from "@arbitex/shared-types";
import { pino } from "pino";

const logger = pino({ level: config.LOG_LEVEL });

// ── Gateway ───────────────────────────────────────────────────────────────────
@WebSocketGateway({
  cors: {
    origin: ["http://localhost:3000", process.env["DASHBOARD_ORIGIN"] ?? ""],
    credentials: true,
  },
  namespace: "/ws",
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly secret = new TextEncoder().encode(config.JWT_SECRET);
  private readonly clientChannels = new Map<string, Set<string>>();

  async handleConnection(client: Socket) {
    const token = client.handshake.auth["token"] as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      await jose.jwtVerify(token, this.secret);
      this.clientChannels.set(client.id, new Set(["system"]));
      logger.debug({ clientId: client.id }, "WS client connected");
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.clientChannels.delete(client.id);
    logger.debug({ clientId: client.id }, "WS client disconnected");
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channels: string[] }
  ) {
    const allowed = new Set([
      "opportunities",
      "executions",
      "pnl",
      "risk",
      "system",
    ]);
    const channels = this.clientChannels.get(client.id) ?? new Set();
    for (const ch of data.channels) {
      if (allowed.has(ch)) channels.add(ch);
    }
    this.clientChannels.set(client.id, channels);
    return { subscribed: Array.from(channels) };
  }

  /** Emit a typed event to all subscribed clients */
  emit<K extends keyof WsEventMap>(event: K, data: WsEventMap[K]): void {
    // Map event prefix to channel
    const channel = event.split(":")[0] as string;
    this.server.emit(event, data);
    logger.debug({ event, channel }, "WS event emitted");
  }

  /** Broadcast health check every 30s */
  startHealthBroadcast(getHealth: () => Promise<WsEventMap["system:health"]>) {
    setInterval(async () => {
      try {
        const health = await getHealth();
        this.emit("system:health", health);
      } catch (err) {
        logger.warn({ err }, "Health broadcast failed");
      }
    }, 30_000);
  }
}

// ── Module ────────────────────────────────────────────────────────────────────
@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WsGatewayModule {}
