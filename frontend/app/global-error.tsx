"use client";

/**
 * Last resort: the root layout itself failed, so `(app)/error.tsx` never
 * gets a chance to render. This file *replaces* the root layout, which
 * means it must supply its own `<html>`/`<body>` — and, per Next's docs,
 * global styles do not reach it, so nothing here can use the Aperture
 * design tokens. Everything is inlined and the palette is duplicated by
 * hand against `prefers-color-scheme`, since `data-theme` isn't readable
 * from here either.
 *
 * If this ever renders in practice, something is badly wrong; it exists so
 * that "badly wrong" still looks like this product and still tells the
 * user their data is untouched.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          background: "#0b0f17",
          color: "#e6edf7",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#7d8899", margin: 0 }}>
            Aperture
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 0" }}>The console failed to start</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#9aa5b6", margin: "12px 0 0" }}>
            Nothing on the platform was changed. Reloading usually clears this; if it doesn&apos;t, the
            frontend may be mid-deploy.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#7d8899", marginTop: 12 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => retry()}
            style={{
              marginTop: 20,
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid #232c3d",
              background: "#141a26",
              color: "#e6edf7",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
