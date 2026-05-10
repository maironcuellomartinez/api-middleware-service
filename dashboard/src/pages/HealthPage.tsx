import { useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchHealthStatus,
  HealthResponse,
  HealthStatusResponse,
  GatewayStatus,
  HttpBulkheadStats,
} from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';

function isGatewayStatus(v: GatewayStatus | { error: string }): v is GatewayStatus {
  return 'circuitBreaker' in v;
}

function isHttpBulkheadStats(v: HttpBulkheadStats | { error: string }): v is HttpBulkheadStats {
  return 'active' in v;
}

export default function HealthPage() {
  const [health, setHealth]           = useState<HealthResponse | null>(null);
  const [status, setStatus]           = useState<HealthStatusResponse | null>(null);
  const [pingLoading, setPingLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Ping — rápido, muestra las tarjetas de arriba de inmediato
    fetchHealth()
      .then((data) => { if (!cancelled) setHealth(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPingLoading(false); });

    // Status — lento (terminus + DB check), carga el panel de componentes aparte
    fetchHealthStatus()
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatusLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const uptimeSeconds = Math.floor(health?.uptime ?? 0);
  const days    = Math.floor(uptimeSeconds / 86400);
  const hours   = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Health</h2>

      {/* Tarjetas superiores — aparecen en cuanto llega /health/ping */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-6 w-16" />
              : <Badge variant={health?.status === 'ok' ? 'success' : 'destructive'}>
                  {health?.status ?? 'unknown'}
                </Badge>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-8 w-24" />
              : <p className="text-2xl font-bold">{`${days}d ${hours}h ${minutes}m`}</p>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Since</CardTitle>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-5 w-32" />
              : <p className="text-sm">
                  {health?.timestamp ? new Date(health.timestamp).toLocaleString() : '-'}
                </p>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response</CardTitle>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-6 w-10" />
              : <Badge variant="success">OK</Badge>
            }
          </CardContent>
        </Card>
      </div>

      {/* Panel de componentes — carga independientemente con su propio skeleton */}
      <Card>
        <CardHeader>
          <CardTitle>Component Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {statusLoading ? (
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : status ? (
            <div className="divide-y">
              {isGatewayStatus(status.gateway) ? (
                <>
                  <StatusRow
                    label="Circuit Breaker"
                    value={status.gateway.circuitBreaker.state}
                    variant={
                      status.gateway.circuitBreaker.state === 'CLOSED'
                        ? 'success'
                        : status.gateway.circuitBreaker.state === 'HALF_OPEN'
                          ? 'warning'
                          : 'destructive'
                    }
                  />
                  <Separator />
                  <StatusRow
                    label="Gateway Bulkhead High"
                    value={`${status.gateway.bulkhead.high.pending} activos / ${status.gateway.bulkhead.high.size} en cola`}
                    variant="secondary"
                  />
                  <Separator />
                  <StatusRow
                    label="Gateway Bulkhead Low"
                    value={`${status.gateway.bulkhead.low.pending} activos / ${status.gateway.bulkhead.low.size} en cola`}
                    variant="secondary"
                  />
                </>
              ) : (
                <StatusRow label="Gateway" value={status.gateway.error} variant="destructive" />
              )}
              <Separator />
              {isHttpBulkheadStats(status.bulkhead) ? (
                <StatusRow
                  label="HTTP Bulkhead"
                  value={`${status.bulkhead.active} activos / ${status.bulkhead.queued} en cola`}
                  variant="secondary"
                />
              ) : (
                <StatusRow label="HTTP Bulkhead" value={status.bulkhead.error} variant="destructive" />
              )}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No se pudo obtener el estado de los componentes
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  value,
  variant = 'secondary',
}: {
  label: string;
  value: string;
  variant?: 'success' | 'warning' | 'destructive' | 'secondary';
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}
