"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/app/_components/auth/AuthProvider";

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
};

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    let activeSocket: Socket | null = null;

    const setup = async () => {
      if (!profile?.userId) {
        setSocket(null);
        setConnected(false);
        return;
      }

      const { supabase } = await import("@/app/(admin)/_lib/supabaseClient");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token || disposed) return;

      await fetch("/api/socket").catch(() => null);
      if (disposed) return;

      activeSocket = io({
        path: "/api/socket_io",
        transports: ["websocket"],
        auth: {
          token,
          userId: profile.userId,
        },
      });

      activeSocket.on("connect", () => {
        if (!disposed) setConnected(true);
      });
      activeSocket.on("disconnect", () => {
        if (!disposed) setConnected(false);
      });

      setSocket(activeSocket);
    };

    void setup();

    return () => {
      disposed = true;
      if (activeSocket) activeSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [profile?.userId]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
