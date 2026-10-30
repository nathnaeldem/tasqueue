import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import StaffDashboard from './pages/StaffDashboard';
import TelegramLogin from './pages/TelegramLogin';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;
  }
  if (!user) return <Navigate to="/" />;
  return children;
};

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (user?.is_admin) return <AdminDashboard />;
  return <StaffDashboard />;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRedirect />
          </ProtectedRoute>
        }
      />
      <Route path="/telegram-login" element={<TelegramLogin />} />
    </Routes>
  );
}

export default App;
