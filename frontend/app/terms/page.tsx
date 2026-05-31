import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — VoxSlides",
  description: "VoxSlides terms of service",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-primary mb-8">Terms of Service</h1>
        <div className="space-y-6 text-sm text-on-surface-variant leading-relaxed">
          <p>Last updated: May 31, 2026</p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">1. Use of Service</h2>
          <p>
            VoxSlides provides AI-powered text-to-speech tools. You agree to use
            the service only for lawful purposes and in compliance with all
            applicable laws.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">2. User Content</h2>
          <p>
            You retain ownership of all text scripts and voice recordings you
            upload. By using VoxSlides, you grant us a limited license to process
            your content solely to provide the service.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">3. Prohibited Use</h2>
          <p>
            You may not use VoxSlides to generate content that is illegal,
            harmful, threatening, abusive, harassing, defamatory, or otherwise
            objectionable. You may not impersonate others or infringe on
            intellectual property rights.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">4. Limitation of Liability</h2>
          <p>
            VoxSlides is provided &quot;as is&quot; without warranties of any kind.
            We are not liable for any damages arising from the use of our service.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">5. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use
            of the service constitutes acceptance of the updated terms.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">6. Contact</h2>
          <p>
            For questions about these terms, contact us at
            support@voxslides.com.
          </p>
        </div>
      </div>
    </div>
  );
}
