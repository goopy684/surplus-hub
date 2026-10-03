import { TERMS_OF_SERVICE } from "@repo/core";
import { LegalDocumentView } from "../../components/LegalDocumentView";

export default function TermsScreen() {
  return <LegalDocumentView document={TERMS_OF_SERVICE} />;
}
