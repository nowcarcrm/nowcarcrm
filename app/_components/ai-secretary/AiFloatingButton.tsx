"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AiSecretaryPanel from "./AiSecretaryPanel";
import { NOW_AI_OPEN_EVENT, type AiSecretaryTabKey, type NowAiOpenDetail } from "./events";

type LeadContext = {
  id: string;
  base?: {
    name?: string;
    desiredVehicle?: string;
    source?: string;
    leadTemperature?: string;
  };
} | null;

export default function AiFloatingButton({ lead }: { lead?: LeadContext }) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AiSecretaryTabKey>("chat");
  const [eventLeadId, setEventLeadId] = useState<string | null>(null);
  const [eventLeadSummary, setEventLeadSummary] = useState<NowAiOpenDetail["leadSummary"] | null>(null);
  const currentLeadId = searchParams?.get("leadId");
  const contextualLeadId = eventLeadId ?? currentLeadId ?? lead?.id ?? null;
  const contextualLeadSummary = useMemo(
    () =>
      eventLeadSummary ?? {
        name: lead?.base?.name,
        desiredVehicle: lead?.base?.desiredVehicle,
        source: lead?.base?.source,
        temperature: lead?.base?.leadTemperature,
      },
    [eventLeadSummary, lead?.base?.desiredVehicle, lead?.base?.leadTemperature, lead?.base?.name, lead?.base?.source]
  );

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<NowAiOpenDetail>;
      if (custom.detail?.tab) setActiveTab(custom.detail.tab);
      setEventLeadId(custom.detail?.leadId ?? null);
      setEventLeadSummary(custom.detail?.leadSummary ?? null);
      setOpen(true);
    };
    window.addEventListener(NOW_AI_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(NOW_AI_OPEN_EVENT, handleOpen);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="나우AI 열기"
        className="nowai-fab fixed bottom-6 right-6 z-[94] flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full border-2 border-[#1e40af]/30 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.12]"
      >
        <Image src="/images/nowcar-ai-logo.png" alt="나우AI" width={44} height={44} className="object-contain" />
      </button>

      <AiSecretaryPanel
        open={open}
        activeTab={activeTab}
        currentLeadId={contextualLeadId}
        leadSummary={contextualLeadSummary ?? undefined}
        onClose={() => setOpen(false)}
        onChangeTab={setActiveTab}
      />
    </>
  );
}
