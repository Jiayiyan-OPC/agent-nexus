import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // useAuth in AuthProvider handles the token from URL params
    // Just redirect to dashboard
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-gray-500">Signing in...</p>
    </div>
  );
}
