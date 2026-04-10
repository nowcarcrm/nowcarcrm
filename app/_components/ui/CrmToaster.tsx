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
          iconTheme: { primary: "#e11d48", secondary: "#fff" },
        },
      }}
    />
  );
}
