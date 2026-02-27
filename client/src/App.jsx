import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Applications from './pages/Applications';
import Users from './pages/Users';
import Franchises from './pages/Franchises';
import Sidebar from './components/Sidebar';

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'Admin') return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/employees" element={<ProtectedLayout><Employees /></ProtectedLayout>} />
      <Route path="/applications" element={<ProtectedLayout><Applications /></ProtectedLayout>} />
      <Route path="/users" element={
        <ProtectedLayout><AdminOnly><Users /></AdminOnly></ProtectedLayout>
      } />
      <Route path="/franchises" element={
        <ProtectedLayout><AdminOnly><Franchises /></AdminOnly></ProtectedLayout>
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}