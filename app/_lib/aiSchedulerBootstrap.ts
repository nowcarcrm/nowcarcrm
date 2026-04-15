import { ensureAiSchedulersStarted } from "@/app/_lib/aiSchedulers";

if (typeof window === "undefined") {
  ensureAiSchedulersStarted();
}
