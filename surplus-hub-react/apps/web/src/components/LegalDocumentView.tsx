"use client";

// Isolates the @repo/core barrel import to a Client Component. The barrel
// re-exports client-only hooks (useEffect-based), so importing it from a
// Server Component (the page) would break the App Router build. Pages stay
// Server Components (keeping `metadata`) and just render this with a `kind`.
import { TERMS_OF_SERVICE, PRIVACY_POLICY, type LegalDocument } from "@repo/core";

const DOCS: Record<"terms" | "privacy", LegalDocument> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
};

export function LegalDocumentView({ kind }: { kind: "terms" | "privacy" }) {
  const doc = DOCS[kind];
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground">{doc.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">시행일: {doc.effectiveDate}</p>

      {doc.intro && (
        <p className="mt-6 text-sm leading-relaxed text-foreground/90">{doc.intro}</p>
      )}

      <div className="mt-8 space-y-7">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
