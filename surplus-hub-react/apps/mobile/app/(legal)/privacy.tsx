import { PRIVACY_POLICY } from "@repo/core";
import { LegalDocumentView } from "../../components/LegalDocumentView";

export default function PrivacyScreen() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
