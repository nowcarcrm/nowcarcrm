import type { NextApiRequest } from "next";
import type { NextApiResponseServerIO } from "@/types/socket";
import { Server as IOServer } from "socket.io";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { setSocketServer } from "@/app/_lib/socketGateway";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: "/api/socket_io",
      cors: {
        origin: "*",
      },
    });

    io.use(async (socket, next) => {
      try {
        const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
        const userId = typeof socket.handshake.auth?.userId === "string" ? socket.handshake.auth.userId : "";
        if (!token || !userId) {
          next(new Error("인증 정보가 없습니다."));
          return;
        }

        const { data, error } = await supabaseAuthVerifier.auth.getUser(token);
        if (error || !data.user) {
          next(new Error("유효하지 않은 인증입니다."));
          return;
        }

        const { data: userRow, error: userErr } = await supabaseAdmin
          .from("users")
          .select("id, auth_user_id")
          .eq("id", userId)
          .maybeSingle();
        if (userErr || !userRow) {
          next(new Error("사용자 식별에 실패했습니다."));
          return;
        }

        if ((userRow as { auth_user_id?: string | null }).auth_user_id !== data.user.id) {
          next(new Error("잘못된 사용자 인증입니다."));
          return;
        }

        socket.data.userId = userId;
        next();
      } catch {
        next(new Error("소켓 인증에 실패했습니다."));
      }
    });

    io.on("connection", (socket) => {
      const userId = String(socket.data.userId ?? "");
      if (userId) {
        socket.join(`user:${userId}`);
      }

      socket.on("disconnect", () => {
        // no-op
      });
    });

    res.socket.server.io = io;
    setSocketServer(io);
  }

  res.end();
}
