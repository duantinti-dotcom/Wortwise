"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: "#090909", color: "#f7f7f7", fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Algo não saiu como esperado</h1>
          <p style={{ color: "#a4a4a4", marginTop: 8 }}>Tente novamente. Se o problema continuar, volte em alguns minutos.</p>
          <button onClick={reset} style={{ marginTop: 24, background: "#ff7900", color: "#140900", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>Tentar novamente</button>
        </div>
      </body>
    </html>
  );
}
