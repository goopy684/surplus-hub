import type { Metadata } from "next";
import { LegalDocumentView } from "../../components/LegalDocumentView";

export const metadata: Metadata = {
  title: "이용약관 - 자투리",
  description: "자투리 서비스 이용약관",
};

export default function TermsPage() {
  return <LegalDocumentView kind="terms" />;
}
