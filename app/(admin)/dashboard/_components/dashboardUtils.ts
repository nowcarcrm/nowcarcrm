export function formatPhoneMasked(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length >= 11) return `${d.slice(0, 3)} · **** · ${d.slice(-4)}`;
  if (d.length >= 8) return `${d.slice(0, 3)} · *** · ${d.slice(-4)}`;
  return phone.trim() || "—";
}
