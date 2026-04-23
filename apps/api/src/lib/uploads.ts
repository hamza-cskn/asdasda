import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=]+)$/i;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".jpg";
}

export async function persistMaintenancePhoto(photoValue: string | undefined): Promise<string | null> {
  const trimmed = photoValue?.trim();
  if (!trimmed) {
    return null;
  }

  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const mimeType = match[1]!;
  const encoded = match[2]!;
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Fotograf boyutu 2 MB sinirini asamaz.");
  }

  const extension = extensionForMime(mimeType);
  const fileName = `${randomUUID()}${extension || extname(trimmed) || ".jpg"}`;
  const relativePath = `/uploads/maintenance/${fileName}`;
  const directory = resolve(process.cwd(), "uploads", "maintenance");

  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, fileName), buffer);

  return relativePath;
}
