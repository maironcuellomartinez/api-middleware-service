import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchClient,
  rotateSecret,
  deactivateClient,
  updateTokenExpiry,
  Client,
  CreateClientResult,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '../components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Separator } from '../components/ui/separator';

function formatExpiry(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretResult, setSecretResult] = useState<CreateClientResult | null>(null);
  const [expiryDialogOpen, setExpiryDialogOpen] = useState(false);
  const [expiryValue, setExpiryValue] = useState(3600);
  const [savingExpiry, setSavingExpiry] = useState(false);

  const loadClient = async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient(clientId);
      setClient(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load client');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const handleRotate = async () => {
    if (!clientId) return;
    if (!window.confirm('Rotate secret for ' + clientId + '?')) return;
    try {
      const result = await rotateSecret(clientId);
      setSecretResult(result);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to rotate secret');
    }
  };

  const handleDeactivate = async () => {
    if (!clientId) return;
    if (!window.confirm('Deactivate ' + clientId + '? This cannot be undone.')) return;
    try {
      await deactivateClient(clientId);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate client');
    }
  };

  const handleSaveExpiry = async () => {
    if (!clientId) return;
    setSavingExpiry(true);
    try {
      await updateTokenExpiry(clientId, expiryValue);
      setExpiryDialogOpen(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update token expiry');
    } finally {
      setSavingExpiry(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Link to="/clients" className="text-sm text-primary hover:text-primary/80">
          &larr; Back to Clients
        </Link>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading client...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/clients" className="text-sm text-primary hover:text-primary/80">
          &larr; Back to Clients
        </Link>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Link to="/clients" className="text-sm text-primary hover:text-primary/80">
          &larr; Back to Clients
        </Link>
        <Alert variant="warning">
          <AlertTitle>Not Found</AlertTitle>
          <AlertDescription>Client not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/clients" className="inline-block text-sm text-primary hover:text-primary/80">
        &larr; Back to Clients
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{client.name}</CardTitle>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {client.clientId}
              </p>
            </div>
            <Badge variant={client.isActive ? 'success' : 'destructive'}>
              {client.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.description && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="mt-1 text-foreground">{client.description}</p>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="mt-1 text-foreground">
                {new Date(client.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Updated</p>
              <p className="mt-1 text-foreground">
                {new Date(client.updatedAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Token Expiry</p>
              <p className="mt-1 text-foreground">
                {formatExpiry(client.tokenExpiresInSeconds)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {secretResult && (
        <Alert variant="warning">
          <AlertTitle>Secret rotated successfully</AlertTitle>
          <AlertDescription>
            <p className="mt-1 break-all">
              <code className="font-mono bg-yellow-100 px-1 rounded">
                {secretResult.clientSecret}
              </code>
            </p>
            <p className="mt-1 text-xs text-yellow-600">
              Save this secret ? it will not be shown again.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {client.isActive && (
        <div className="flex gap-3">
          <Dialog open={expiryDialogOpen} onOpenChange={setExpiryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Edit Expiry</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Token Expiry</DialogTitle>
                <DialogDescription>
                  Set the access token duration in seconds (min: 3600 = 1h, max: 604800 = 7 days).
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  type="number"
                  min={3600}
                  max={604800}
                  value={expiryValue}
                  onChange={(e) => setExpiryValue(parseInt(e.target.value) || 3600)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExpiryDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveExpiry} disabled={savingExpiry}>
                  {savingExpiry ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleRotate}>
            Rotate Secret
          </Button>
          <Button variant="destructive" onClick={handleDeactivate}>
            Deactivate Client
          </Button>
        </div>
      )}
    </div>
  );
}
