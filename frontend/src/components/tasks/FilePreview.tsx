import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function AuthenticatedImage({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const token = api.getAccessToken();

    fetch(`/api/files/${fileId}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (!src) return <div className="h-24 bg-muted rounded-lg animate-pulse" />;
  return <img src={src} alt={alt} className={className} />;
}

export function openAuthenticatedPreview(fileId: string) {
  const token = api.getAccessToken();
  fetch(`/api/files/${fileId}/preview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    });
}
