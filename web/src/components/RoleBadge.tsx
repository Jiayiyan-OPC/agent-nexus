import { Badge } from '@/components/ui/badge';

const roleColors: Record<string, string> = {
  arch: 'bg-purple-100 text-purple-800',
  pmo: 'bg-blue-100 text-blue-800',
  dev: 'bg-emerald-100 text-emerald-800',
  qa: 'bg-amber-100 text-amber-800',
  devops: 'bg-orange-100 text-orange-800',
};

export default function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary" className={roleColors[role] ?? 'bg-gray-100 text-gray-800'}>
      {role}
    </Badge>
  );
}
