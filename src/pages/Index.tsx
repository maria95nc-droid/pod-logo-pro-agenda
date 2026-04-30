import AppLayout from "@/components/AppLayout";
import Today from "@/pages/Today";

// La ruta raíz renderiza AppLayout → Today a través del router en App.tsx.
// Este componente queda por compatibilidad; no se usa directamente.
export default function Index() {
  return (
    <AppLayout>
      <Today />
    </AppLayout>
  );
}
