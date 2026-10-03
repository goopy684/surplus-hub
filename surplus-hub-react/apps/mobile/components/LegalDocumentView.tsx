import { ScrollView, Text, View } from "react-native";
import type { LegalDocument } from "@repo/core";

type LegalDocumentViewProps = {
  document: LegalDocument;
};

export function LegalDocumentView({ document }: LegalDocumentViewProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text className="text-2xl font-bold text-foreground">{document.title}</Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        시행일: {document.effectiveDate}
      </Text>

      {document.intro ? (
        <Text className="mt-4 text-base leading-6 text-foreground">{document.intro}</Text>
      ) : null}

      {document.sections.map((section) => (
        <View key={section.heading} className="mt-6">
          <Text className="text-base font-bold text-foreground">{section.heading}</Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text
              key={`${section.heading}-${index}`}
              className="mt-2 text-base leading-6 text-foreground"
            >
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
