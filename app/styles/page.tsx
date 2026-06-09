import { StylesView } from "./styles-view";

export default function StylesPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Style presets</h1>
      <p className="text-[color:var(--muted-foreground)] mt-2">
        Upload 3–12 reference thumbnails. Claude extracts a reusable style guide
        (font, color, position, shading) that future runs can use.
      </p>
      <div className="mt-8">
        <StylesView />
      </div>
    </div>
  );
}
