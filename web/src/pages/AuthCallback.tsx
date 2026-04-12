import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(user ? '/' : '/login', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-gray-500">Signing in...</p>
    </div>
  );
}
