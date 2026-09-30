from __future__ import annotations

import io
import unittest

from pypdf import PdfWriter

from contracts import AskRequest, ExtractedContent
from document_ai_ocr import document_ai_ocr_from_environment
from providers.base import DocumentProvider, ProviderSearchHit
from service import collect_evidence


class BlankPdfProvider(DocumentProvider):
    provider = "test"

    async def search(self, request: AskRequest):
        return [
            ProviderSearchHit(
                provider=self.provider,
                item_id="scan-1",
                name="scanned-policy.pdf",
                mime_type="application/pdf",
                rank=1,
            )
        ]

    async def download(self, hit: ProviderSearchHit) -> bytes:
        output = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        writer.write(output)
        return output.getvalue()


class FakeOcrExtractor:
    async def extract(self, **kwargs) -> ExtractedContent:
        return ExtractedContent(
            full_text="Paid leave policy extracted from a scanned PDF.",
            character_count=47,
            extraction_method="google_document_ai_ocr",
            page_count=1,
        )


class DocumentAiOcrIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_scanned_pdf_uses_ocr_fallback(self):
        bundle = await collect_evidence(
            AskRequest(question="What is the paid leave policy?"),
            BlankPdfProvider(),
            ocr_extractor=FakeOcrExtractor(),
        )

        self.assertEqual(bundle.retrieval.documents_included, 1)
        self.assertEqual(bundle.errors, [])
        self.assertEqual(bundle.warnings, [])
        self.assertEqual(
            bundle.documents[0].content.extraction_method,
            "google_document_ai_ocr",
        )
        self.assertEqual(bundle.documents[0].content.page_count, 1)

    def test_ocr_is_disabled_by_default(self):
        self.assertIsNone(document_ai_ocr_from_environment({}))


if __name__ == "__main__":
    unittest.main()
