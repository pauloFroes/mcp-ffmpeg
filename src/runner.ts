import { execFile } from "node:child_process";
import { mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function toolResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

export function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function toolResultWithImages(
  data: unknown,
  images: Array<{ base64: string; mimeType: string }>,
) {
  return {
    content: [
      ...images.map((img) => ({
        type: "image" as const,
        data: img.base64,
        mimeType: img.mimeType,
      })),
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

export async function execCommand(
  command: string,
  args: string[],
  options?: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  const timeout = options?.timeout ?? 300_000;

  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 50 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Command failed: ${command} ${args.join(" ")}\n${stderr || error.message}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

export async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `mcp-ffmpeg-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export async function readFileAsBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}
