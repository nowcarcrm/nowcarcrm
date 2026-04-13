import { redirect } from "next/navigation";

/** 로그인 분기에서 관리자 진입 URL로 사용; 실제 홈은 대시보드와 동일 */
export default function AdminEntryPage() {
  redirect("/dashboard");
}
