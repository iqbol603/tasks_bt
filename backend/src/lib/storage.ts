import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localUploadDir = process.env.UPLOAD_DIR ?? path.join(__dirname, '../../uploads');

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'rps-files';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;

let s3: S3Client | null = null;

function getS3(): S3Client | null {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY) return null;
  if (!s3) {
    s3 = new S3Client({
      endpoint: MINIO_ENDPOINT,
      region: process.env.MINIO_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    });
  }
  return s3;
}

export function isMinioConfigured(): boolean {
  return !!getS3();
}

export interface StoredFile {
  storageKey: string;
  path: string;
}

export async function storeFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<StoredFile> {
  const client = getS3();

  if (client) {
    const key = `uploads/${Date.now()}-${filename}`;
    await client.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return { storageKey: key, path: `minio://${MINIO_BUCKET}/${key}` };
  }

  if (!fs.existsSync(localUploadDir)) {
    fs.mkdirSync(localUploadDir, { recursive: true });
  }
  const localName = `${Date.now()}-${filename}`;
  const localPath = path.join(localUploadDir, localName);
  fs.writeFileSync(localPath, buffer);
  return { storageKey: localName, path: localPath };
}

export async function getFileStream(filePath: string): Promise<{ stream: Readable; mimeType?: string }> {
  if (filePath.startsWith('minio://')) {
    const client = getS3();
    if (!client) throw new Error('MinIO не настроен');

    const match = filePath.match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('Неверный путь файла');

    const response = await client.send(
      new GetObjectCommand({ Bucket: match[1], Key: match[2] }),
    );
    return {
      stream: response.Body as Readable,
      mimeType: response.ContentType,
    };
  }

  return { stream: fs.createReadStream(filePath) };
}

export async function deleteLocalFile(filePath: string) {
  if (!filePath.startsWith('minio://') && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
