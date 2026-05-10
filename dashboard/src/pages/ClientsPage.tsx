import { useEffect, useState } from 'react';
import {
  fetchClients,
  createClient,
  rotateSecret,
  deactivateClient,
  reactivateClient,
  deleteClient,
  Client,
  CreateClientPayload,
  CreateClientResult,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import ViewClientSheet from '../components/ViewClientSheet';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createResult, setCreateResult] = useState<CreateClientResult | null>(null);
  const [rotateResult, setRotateResult] = useState<CreateClientResult | null>(null);
  const [rotateTarget, setRotateTarget] = useState<string | null>(null);
  const [viewClientId, setViewClientId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreate = async (payload: CreateClientPayload) => {
    try {
      const result = await createClient(payload);
      setCreateResult(result);
      setShowCreate(false);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create client');
    }
  };

  const handleRotate = (clientId: string) => {
    setRotateTarget(clientId);
  };

  const handleConfirmRotate = async () => {
    if (!rotateTarget) return;
    try {
      const result = await rotateSecret(rotateTarget);
      setRotateResult(result);
      setRotateTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to rotate secret');
      setRotateTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.clientId);
      setDeleteTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el cliente');
      setDeleteTarget(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    try {
      if (statusTarget.isActive) {
        await deactivateClient(statusTarget.clientId);
      } else {
        await reactivateClient(statusTarget.clientId);
      }
      setStatusTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado del cliente');
      setStatusTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Clients</h2>
        <Button
          onClick={() => {
            setShowCreate(true);
            setCreateResult(null);
          }}
        >
          Create Client
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {createResult && (
        <Alert variant="warning">
          <AlertTitle>Client created successfully</AlertTitle>
          <AlertDescription>
            <p className="mt-1">
              Client ID: <code className="font-mono bg-yellow-100 px-1 rounded">{createResult.clientId}</code>
            </p>
            <p>
              Client Secret: <code className="font-mono bg-yellow-100 px-1 rounded break-all">{createResult.clientSecret}</code>
            </p>
            <p className="mt-1 text-xs text-yellow-600">
              Save this secret — it will not be shown again.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {rotateResult && (
        <Alert variant="warning">
          <AlertTitle>Secret rotated successfully</AlertTitle>
          <AlertDescription>
            <p className="mt-1">
              New Secret: <code className="font-mono bg-yellow-100 px-1 rounded break-all">{rotateResult.clientSecret}</code>
            </p>
            <p className="mt-1 text-xs text-yellow-600">
              Save this secret — it will not be shown again.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {showCreate && (
        <CreateClientForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No clients found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.clientId}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {client.clientId}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? 'success' : 'destructive'}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewClientId(client.clientId)}
                        >
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRotateTarget(client.clientId)}
                        >
                          Rotate
                        </Button>
                        {client.isActive ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setStatusTarget(client)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStatusTarget(client)}
                            >
                              Reactivate
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(client)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ViewClientSheet
        clientId={viewClientId}
        onClose={() => setViewClientId(null)}
      />

      {/* Confirmación de cambio de estado */}
      <Dialog open={statusTarget !== null} onOpenChange={(open) => { if (!open) setStatusTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.isActive ? 'Desactivar cliente' : 'Reactivar cliente'}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.isActive
                ? <>¿Seguro que querés desactivar <strong>{statusTarget.name}</strong>? El cliente perderá acceso inmediatamente y no podrá obtener nuevos tokens.</>
                : <>¿Querés reactivar <strong>{statusTarget?.name}</strong>? El cliente podrá volver a autenticarse con sus credenciales existentes.</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant={statusTarget?.isActive ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
            >
              {statusTarget?.isActive ? 'Desactivar' : 'Reactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación permanente */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cliente permanentemente</DialogTitle>
            <DialogDescription>
              Esta acción <strong>no se puede deshacer</strong>. El cliente{' '}
              <strong>{deleteTarget?.name}</strong> y todas sus credenciales serán eliminados
              de la base de datos. Los tokens emitidos dejarán de funcionar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de rotación de secret */}
      <Dialog open={rotateTarget !== null} onOpenChange={(open) => { if (!open) setRotateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate Secret</DialogTitle>
            <DialogDescription>
              This will invalidate the current secret for <strong>{rotateTarget}</strong>. Any services using the old secret will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input value={rotateTarget ?? ''} disabled />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRotate}>
              Rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClientForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: CreateClientPayload) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopesInput, setScopesInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const scopes = scopesInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      clientName: name.trim(),
      description: description.trim() || undefined,
      scopes: scopes.length > 0 ? scopes : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Client</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Client Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scopes">Allowed Scopes</Label>
            <Input
              id="scopes"
              value={scopesInput}
              onChange={(e) => setScopesInput(e.target.value)}
              placeholder="records:read incidents:read  (space or comma separated)"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all scopes. Separate with spaces or commas.
            </p>
          </div>
          <div className="flex gap-3">
            <Button type="submit">Create</Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
