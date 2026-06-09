import { GenerateForm } from "./generate-form";

export default function GeneratePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Generate a thumbnail</h1>
      <p className="text-[color:var(--muted-foreground)] mt-2">
        Paste a YouTube URL for a two-host interview-style video. The pipeline will produce
        3 thumbnail variants.
      </p>
      <div className="mt-8">
        <GenerateForm />
      </div>
    </div>
  );
}
