import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Login() {
  const { loginWithGoogle, loginWithMicrosoft } = useAuth();

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Agent Nexus</CardTitle>
          <p className="text-center text-sm text-gray-500">Sign in to continue</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full" onClick={loginWithGoogle}>
            Sign in with Google
          </Button>
          <Button variant="outline" className="w-full" onClick={loginWithMicrosoft}>
            Sign in with Microsoft
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
