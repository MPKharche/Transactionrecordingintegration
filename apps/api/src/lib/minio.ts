import { Client as MinioClient } from "minio";
import { createHash } from "crypto";

let client: MinioClient | null = null;

export function getMinio(): MinioClient {
  if (!client) {
    client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    });
  }
  return client;
}

export const BUCKET = process.env.MINIO_BUCKET ?? "ca-uploads";

export async function ensureBucket() {
  const m = getMinio();
  const exists = await m.bucketExists(BUCKET);
  if (!exists) await m.makeBucket(BUCKET, "us-east-1");
}

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export function storagePath(
  clientGstin: string,
  fy: string,
  docType: string,
  id: string,
  ext: string
) {
  return `documents/${clientGstin}/${fy}/${docType}/${id}.${ext}`;
}

export async function putObject(path: string, buf: Buffer, mime: string) {
  await ensureBucket();
  await getMinio().putObject(BUCKET, path, buf, buf.length, { "Content-Type": mime });
}

export async function presignedGet(path: string, expiry = 3600) {
  return getMinio().presignedGetObject(BUCKET, path, expiry);
}

export async function getObjectStream(path: string) {
  await ensureBucket();
  return getMinio().getObject(BUCKET, path);
}

export async function statObject(path: string) {
  await ensureBucket();
  return getMinio().statObject(BUCKET, path);
}

export async function removeObject(path: string) {
  await getMinio().removeObject(BUCKET, path);
}
