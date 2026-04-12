import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { label: string; className: string }> = {
  online: { label: 'Online', className: 'bg-green-100 text-green-800' },
  offline: { label: 'Offline', className: 'bg-gray-100 text-gray-600' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.offline;
  return (
    <Badge variant="secondary" className={config.className}>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
        status === 'online' ? 'bg-green-500 animate-pulse' :
        status === 'error' ? 'bg-red-500' : 'bg-gray-400'
      }`} />
      {config.label}
    </Badge>
  );
}
