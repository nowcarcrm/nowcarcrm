import type { Server as IOServer } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var __NOWCAR_IO__: IOServer | undefined;
}

export function setSocketServer(io: IOServer) {
  globalThis.__NOWCAR_IO__ = io;
}

export function getSocketServer(): IOServer | undefined {
  return globalThis.__NOWCAR_IO__;
}

export function emitToUserRoom(userId: string, event: string, payload: unknown) {
  const io = getSocketServer();
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, payload);
  return true;
}
