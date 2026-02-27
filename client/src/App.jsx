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
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
      <div style={{ color: '#64748b', fontFamily: 'DM Sans', fontSize: '14px' }}>Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        background: '#f8fafc',
        padding: '32px 36px',
      }}>
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
      <Route path="/users" element={<ProtectedLayout><AdminOnly><Users /></AdminOnly></ProtectedLayout>} />
      <Route path="/franchises" element={<ProtectedLayout><AdminOnly><Franchises /></AdminOnly></ProtectedLayout>} />
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