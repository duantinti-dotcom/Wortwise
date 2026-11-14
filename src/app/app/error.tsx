"use client";
import { RotateCcw } from "lucide-react";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Algo não saiu como esperado</h1>
      <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Seus dados estão preservados.</p>
      <button onClick={reset} className="btn btn-primary mt-6"><RotateCcw size={15} /> Tentar novamente</button>
    </div>
  );
}
