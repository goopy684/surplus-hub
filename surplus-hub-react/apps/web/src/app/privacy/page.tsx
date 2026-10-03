import type { Metadata } from "next";
import { LegalDocumentView } from "../../components/LegalDocumentView";

export const metadata: Metadata = {
  title: "개인정보 처리방침 - 자투리",
  description: "자투리 개인정보 처리방침",
};

export default function PrivacyPage() {
  return <LegalDocumentView kind="privacy" />;
}
