export type NotificationType = "new-lead-assigned" | "lead-reassigned" | "ai-alert" | "notification";

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};
