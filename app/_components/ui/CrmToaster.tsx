"use client";

import { Toaster } from "react-hot-toast";

export function CrmToaster() {
  return (
    <Toaster
      position="top-right"
      containerClassName="!top-4 !right-4 sm:!top-5 sm:!right-5"
      toastOptions={{
        duration: 2800,
        className:
          "!rounded-xl !border !border-slate-200/95 !bg-white !px-4 !py-3 !text-sm !font-medium !text-slate-900 !shadow-lg !animate-[crm-toast-in_0.26s_ease-out_both] dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-50",
        success: {
          iconTheme: { primary: "var(--nowcar-brand-navy)", secondary: "#fff" },
          className:
            "!rounded-xl !border !border-slate-200/95 !bg-white !px-4 !py-3 !text-sm !font-medium !text-slate-900 !shadow-lg !animate-[crm-toast-in_0.26s_ease-out_both] dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-50",
        },
        error: {
          className:
            "!rounded-xl !border !border-rose-200/90 !bg-rose-50/96 !px-4 !py-3 !text-sm !font-medium !text-rose-950 !shadow-md !animate-[crm-toast-in_0.26s_ease-out_both] dark:!border-rose-500/28 dark:!bg-rose-950/55 dark:!text-rose-50",
          iconTheme: { primary: "#be123c", secondary: "#fff" },
        },
      }}
    />
  );
}
