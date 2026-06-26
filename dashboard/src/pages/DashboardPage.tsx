import { useEffect, useState } from 'react';
import { fetchClients, fetchHealth, fetchLogs, Client, HealthResponse, RequestLog } from '../lib/api';
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
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async (cancelled: { value: boolean }) => {
    setLogsError(null);
    try {
      const data = await fetchLogs(30);
      if (!cancelled.value) setLogs(data);
    } catch {
      if (!cancelled.value) setLogsError('error');
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
          activeClients: clients.filter((c: Client) => c.isActive).length,
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

      loadLogs(cancelled);
    }

    load();

    const interval = setInterval(() => loadLogs(cancelled), 60_000);
    return () => { cancelled.value = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
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

      {/* Activity logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Actividad reciente</CardTitle>
          <button
            onClick={() => loadLogs({ value: false })}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          {logsError ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              <p className="font-medium">No se pudieron obtener los logs</p>
              <button
                onClick={() => loadLogs({ value: false })}
                className="mt-3 text-xs underline text-primary hover:opacity-80"
              >
                Reintentar
              </button>
            </div>
          ) : logs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <MethodBadge method={log.method} />
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-xs truncate" title={log.url}>
                        {log.url}
                      </TableCell>
                      <TableCell>
                        <StatusBadge code={log.statusCode} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.durationMs}ms
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.ip}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              Sin actividad registrada. Las peticiones aparecerán aquí automáticamente.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET:    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
    POST:   'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
    PUT:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400',
    PATCH:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
    DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${colors[method.toUpperCase()] ?? 'bg-muted text-muted-foreground'}`}>
      {method.toUpperCase()}
    </span>
  );
}

function StatusBadge({ code }: { code: number }) {
  const cls =
    code >= 500 ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
    code >= 400 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400' :
    code >= 300 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' :
                  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {code}
    </span>
  );
}
