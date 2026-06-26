import { useEffect, useState } from 'react';
import { fetchClients, fetchHealth, fetchRecords, Client, HealthResponse, RequestRecord } from '../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Users, UserCheck, Activity, Clock, RefreshCw } from 'lucide-react';

interface DashboardData {
  totalClients: number;
  activeClients: number;
  healthStatus: string;
  uptime: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentRecords, setRecentRecords] = useState<RequestRecord[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = async (cancelled: { value: boolean }) => {
    setRecordsError(null);
    try {
      const records = await fetchRecords({ limit: 5 });
      if (!cancelled.value) setRecentRecords(records.slice(0, 5));
    } catch (err: unknown) {
      if (!cancelled.value) {
        const is503 = err instanceof Error && err.message.includes('503');
        setRecordsError(is503 ? 'gateway-down' : 'error');
      }
    }
  };

  useEffect(() => {
    const cancelled = { value: false };

    async function load() {
      try {
        const [clients, health] = await Promise.all([
          fetchClients(),
          fetchHealth(),
        ]);

        if (cancelled.value) return;

        const uptimeSeconds = Math.floor(Number(health.uptime) || 0);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);

        setData({
          totalClients: clients.length,
          activeClients: clients.filter((c) => c.isActive).length,
          healthStatus: health.status,
          uptime: `${hours}h ${minutes}m`,
        });
      } catch (err: unknown) {
        if (!cancelled.value) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled.value) setLoading(false);
      }

      loadRecords(cancelled);
    }

    load();
    return () => { cancelled.value = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.totalClients ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Clients</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.activeClients ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Health Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <Badge variant={data?.healthStatus === 'ok' ? 'success' : 'destructive'}>
              {data?.healthStatus ?? 'unknown'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.uptime ?? '0h 0m'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent records */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Recent Records</CardTitle>
          <button
            onClick={() => loadRecords({ value: false })}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          {recordsError ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              <p className="font-medium">
                {recordsError === 'gateway-down' ? 'Gateway no disponible' : 'Error al cargar registros'}
              </p>
              <p className="mt-1 text-xs">
                {recordsError === 'gateway-down'
                  ? 'Los registros se cargarán cuando el api-gateway esté activo.'
                  : 'No se pudieron obtener los registros recientes.'}
              </p>
              <button
                onClick={() => loadRecords({ value: false })}
                className="mt-3 text-xs underline text-primary hover:opacity-80"
              >
                Reintentar
              </button>
            </div>
          ) : recentRecords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs">{record.requestNumber}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              No records found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
    CREATED:     'info',
    DELIVERED:   'info',
    IN_PROGRESS: 'warning',
    PAUSED:      'secondary',
    CLOSED:      'secondary',
    VALIDATED:   'success',
    REOPENED:    'warning',
  };

  return (
    <Badge variant={variantMap[status.toUpperCase()] ?? 'secondary'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}
