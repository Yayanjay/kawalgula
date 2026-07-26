import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import WhatsappPage from "./pages/WhatsappPage";
import PatientsPage from "./pages/PatientsPage";
import PatientMedicationsPage from "./pages/PatientMedicationsPage";
import MedicationsPage from "./pages/MedicationsPage";
import TemplatesPage from "./pages/TemplatesPage";
import ConsumptionPage from "./pages/ConsumptionPage";
import BlastsPage from "./pages/BlastsPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<PatientsPage />} />
                <Route path="/whatsapp" element={<WhatsappPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/patients/:id/medications" element={<PatientMedicationsPage />} />
                <Route path="/medications" element={<MedicationsPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/consumption" element={<ConsumptionPage />} />
                <Route path="/blasts" element={<BlastsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
