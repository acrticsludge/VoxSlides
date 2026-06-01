import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — VoxSlides",
  description: "VoxSlides privacy policy",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-primary mb-8">Privacy Policy</h1>
        <div className="space-y-6 text-sm text-on-surface-variant leading-relaxed">
          <p>Last updated: May 31, 2026</p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">1. Data We Collect</h2>
          <p>
            VoxSlides processes your voice recordings and text scripts to generate
            speech audio. Voice samples are sent to third-party TTS services
            (ElevenLabs, FishSpeech) for processing and are not stored on our
            servers after generation.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">2. How We Use Your Data</h2>
          <p>
            Your data is used solely to provide the text-to-speech service. We do
            not sell, share, or use your data for advertising or profiling.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">3. Third-Party Services</h2>
          <p>
            We use ElevenLabs and FishSpeech for speech synthesis. These services
            receive your audio and text input to generate output. Please refer to
            their respective privacy policies for details on how they handle data.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">4. Data Retention</h2>
          <p>
            Generated audio is stored locally in your browser and is not uploaded
            to our servers. History is stored in your browser&apos;s local storage
            and can be cleared at any time.
          </p>

          <h2 className="text-lg font-semibold text-on-surface pt-4">5. Contact</h2>
          <p>
            For questions about this privacy policy, contact us at
            support@voxslides.com.
          </p>
        </div>
      </div>
    </div>
  );
}
