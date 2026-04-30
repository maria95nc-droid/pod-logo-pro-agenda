import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Today from "@/pages/Today";
import Agenda from "@/pages/Agenda";
import Patients from "@/pages/Patients";
import MaterialPage from "@/pages/Material";
import Finance from "@/pages/Finance";
import Settings from "@/pages/Settings";
import NewVisit from "@/pages/NewVisit";
import VisitDetail from "@/pages/VisitDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Today />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/pacientes" element={<Patients />} />
            <Route path="/material" element={<MaterialPage />} />
            <Route path="/finanzas" element={<Finance />} />
            <Route path="/configuracion" element={<Settings />} />
            <Route path="/visita/nueva" element={<NewVisit />} />
            <Route path="/visita/:id" element={<VisitDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
