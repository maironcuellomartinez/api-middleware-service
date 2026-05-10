import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { fetchClient, updateTokenExpiry, Client } from '../lib/api';

function formatExpiry(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

interface ViewClientSheetProps {
  clientId: string | null;
  onClose: () => void;
}

export default function ViewClientSheet({ clientId, onClose }: ViewClientSheetProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryValue, setExpiryValue] = useState(3600);
  const [savingExpiry, setSavingExpiry] = useState(false);

  const loadClient = async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setClient(null);
    try {
      const data = await fetchClient(clientId);
      setClient(data);
      setExpiryValue(data.tokenExpiresInSeconds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load client');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const handleSaveExpiry = async () => {
    if (!clientId || !client) return;
    setSavingExpiry(true);
    try {
      await updateTokenExpiry(clientId, expiryValue);
      setEditingExpiry(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update token expiry');
    } finally {
      setSavingExpiry(false);
    }
  };

  return (
    <Sheet open={clientId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Client Details</SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading client details...
          </div>
        )}

        {error && (
          <div className="text-destructive text-sm py-4">{error}</div>
        )}

        {!loading && !error && client && (
          <div className="space-y-4 py-4">
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Client ID</span>
              <span className="font-mono text-sm">{client.clientId}</span>
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Name</span>
              <span>{client.name}</span>
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Description</span>
              <span className="text-sm text-muted-foreground">
                {client.description ?? '?'}
              </span>
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Status</span>
              <Badge variant={client.isActive ? 'success' : 'destructive'}>
                {client.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Token Expiry</span>
              {editingExpiry ? (
                <div className="mt-1 space-y-2">
                  <Input
                    type="number"
                    min={3600}
                    max={604800}
                    value={expiryValue}
                    onChange={(e) => setExpiryValue(parseInt(e.target.value) || 3600)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveExpiry} disabled={savingExpiry}>
                      {savingExpiry ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingExpiry(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {formatExpiry(client.tokenExpiresInSeconds)}
                  </span>
                  {client.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setEditingExpiry(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Allowed Scopes</span>
              {client.allowedScopes && client.allowedScopes.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.allowedScopes.map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unrestricted</span>
              )}
            </div>
            <div>
              <span className="block text-sm font-semibold text-muted-foreground">Created</span>
              <span className="text-sm text-muted-foreground">
                {new Date(client.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-6 right-6">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
