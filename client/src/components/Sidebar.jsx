import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navClass = ({ isActive }) =>
    `block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700'
    }`;

  return (
    <div className="w-64 bg-gray-900 flex flex-col h-full">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-white text-xl font-bold">Khusela</h1>
        <p className="text-gray-400 text-xs mt-1">{user?.role} · {user?.username}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <NavLink to="/" end className={({ isActive }) =>
          `block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700'}`}
          style={({ isActive }) => isActive ? { backgroundColor: '#2563eb' } : {}}>
          Dashboard
        </NavLink>

        {(user?.role === 'Admin' || user?.role === 'HR') && (
          <NavLink to="/employees" className={navClass}
            style={({ isActive }) => isActive ? { backgroundColor: '#2563eb' } : {}}>
            Employees
          </NavLink>
        )}

        <NavLink to="/applications" className={navClass}
          style={({ isActive }) => isActive ? { backgroundColor: '#2563eb' } : {}}>
          Applications
        </NavLink>

        {user?.role === 'Admin' && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-gray-500 text-xs uppercase font-semibold px-4">Admin</p>
            </div>
            <NavLink to="/users" className={navClass}
              style={({ isActive }) => isActive ? { backgroundColor: '#2563eb' } : {}}>
              User Management
            </NavLink>
            <NavLink to="/franchises" className={navClass}
              style={({ isActive }) => isActive ? { backgroundColor: '#2563eb' } : {}}>
              Franchises
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-left"
        >
          Logout
        </button>
      </div>
    </div>
  );
}