"""Fetch upload bytes from MinIO."""
from __future__ import annotations

import io
import os
from typing import Optional

try:
    from minio import Minio
except ImportError:
    Minio = None  # type: ignore


def fetch_object(storage_path: str) -> Optional[bytes]:
    if not storage_path or Minio is None:
        return None
    endpoint = os.environ.get("MINIO_ENDPOINT", "localhost")
    port = int(os.environ.get("MINIO_PORT", "9000"))
    bucket = os.environ.get("MINIO_BUCKET", "ca-uploads")
    # minio>=7 expects host:port in endpoint (no separate `port` kwarg).
    host = endpoint if ":" in endpoint else f"{endpoint}:{port}"
    client = Minio(
        host,
        access_key=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
        secure=os.environ.get("MINIO_USE_SSL", "").lower() == "true",
    )
    resp = None
    try:
        resp = client.get_object(bucket, storage_path)
        return resp.read()
    except Exception:
        return None
    finally:
        if resp is not None:
            try:
                resp.close()
                resp.release_conn()
            except Exception:
                pass
