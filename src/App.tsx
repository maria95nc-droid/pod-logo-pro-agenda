import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Today from "@/pages/Today";
import Agenda from "@/pages/Agenda";
import Patients from "@/pages/Patients";
import MaterialPage from "@/pages/Material";
import Finance from "@/pages/Finance";
import Exports from "@/pages/Exports";
import Settings from "@/pages/Settings";
import NewVisit from "@/pages/NewVisit";
import VisitDetail from "@/pages/VisitDetail";
import NewPatient from "@/pages/NewPatient";
import NewCenter from "@/pages/NewCenter";
import NewMaterial from "@/pages/NewMaterial";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Today />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/pacientes" element={<Patients />} />
              <Route path="/pacientes/nuevo" element={<NewPatient />} />
              <Route path="/pacientes/:id/editar" element={<NewPatient />} />
              <Route path="/centros/nuevo" element={<NewCenter />} />
              <Route path="/centros/:id/editar" element={<NewCenter />} />
              <Route path="/material" element={<MaterialPage />} />
              <Route path="/material/nuevo" element={<NewMaterial />} />
              <Route path="/finanzas" element={<Finance />} />
              <Route path="/exportar" element={<Exports />} />
              <Route path="/configuracion" element={<Settings />} />
              <Route path="/visita/nueva" element={<NewVisit />} />
              <Route path="/visita/:id" element={<VisitDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
