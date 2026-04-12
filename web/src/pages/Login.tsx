import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Agent Nexus</CardTitle>
          <p className="text-center text-sm text-gray-500">Sign in to continue</p>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={login}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
