"use client";

import { Toaster } from "react-hot-toast";

export function CrmToaster() {
  return (
    <Toaster
      position="top-center"
      containerClassName="!top-4"
      toastOptions={{
        duration: 3200,
        className:
          "!rounded-xl !border !border-zinc-200 !bg-white !px-4 !py-3 !text-sm !font-medium !text-zinc-900 !shadow-lg dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-50",
        success: {
          iconTheme: { primary: "#4f46e5", secondary: "#fff" },
        },
        error: {
          className:
            "!rounded-xl !border !border-rose-200/90 !bg-rose-50/95 !px-4 !py-3 !text-sm !font-medium !text-rose-950 !shadow-md dark:!border-rose-500/25 dark:!bg-rose-950/50 dark:!text-rose-50",
          iconTheme: { primary: "#b45309", secondary: "#fff" },
        },
      }}
    />
  );
}
