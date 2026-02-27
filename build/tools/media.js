import { z } from "zod";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { execCommand, toolResult, toolError, toolResultWithImages, createTempDir, cleanupTempDir, readFileAsBase64, } from "../runner.js";
async function whichCommand(cmd) {
    try {
        const { stdout } = await execCommand("which", [cmd], { timeout: 5_000 });
        const path = stdout.trim();
        if (!path)
            return { found: false };
        try {
            const { stdout: versionOut } = await execCommand(cmd, ["-version"], { timeout: 5_000 });
            const version = versionOut.trim().split("\n")[0];
            return { found: true, path, version };
        }
        catch {
            return { found: true, path };
        }
    }
    catch {
        return { found: false };
    }
}
export function registerMediaTools(server) {
    server.registerTool("check_dependencies", {
        title: "Check Dependencies",
        description: "Check if ffmpeg and ffprobe are installed and available in PATH. Returns status, version, and installation instructions if missing.",
        inputSchema: {},
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, async () => {
        try {
            const deps = ["ffmpeg", "ffprobe"];
            const results = await Promise.all(deps.map(async (dep) => {
                const info = await whichCommand(dep);
                return {
                    name: dep,
                    installed: info.found,
                    path: info.path ?? null,
                    version: info.version ?? null,
                };
            }));
            const allInstalled = results.every((r) => r.installed);
            const missing = results.filter((r) => !r.installed).map((r) => r.name);
            return toolResult({
                allDependenciesInstalled: allInstalled,
                dependencies: results,
                ...(missing.length > 0
                    ? { installInstructions: `Install missing dependencies:\n  brew install ${missing.join(" ")}` }
                    : {}),
            });
        }
        catch (error) {
            return toolError(`Failed to check dependencies: ${error.message}`);
        }
    });
    server.registerTool("get_media_info", {
        title: "Get Media Info",
        description: "Get metadata about a local media file (video or audio): duration, resolution, codecs, format, filesize. Uses ffprobe.",
        inputSchema: {
            file_path: z.string().describe("Absolute path to a local media file"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, async ({ file_path }) => {
        try {
            const { stdout } = await execCommand("ffprobe", [
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path,
            ], { timeout: 15_000 });
            const info = JSON.parse(stdout);
            const videoStream = info.streams?.find((s) => s.codec_type === "video");
            const audioStream = info.streams?.find((s) => s.codec_type === "audio");
            const format = info.format ?? {};
            return toolResult({
                filePath: format.filename ?? file_path,
                duration: format.duration ? parseFloat(format.duration) : null,
                resolution: videoStream
                    ? `${videoStream.width}x${videoStream.height}`
                    : null,
                width: videoStream?.width ?? null,
                height: videoStream?.height ?? null,
                fps: videoStream?.r_frame_rate ?? null,
                videoCodec: videoStream?.codec_name ?? null,
                audioCodec: audioStream?.codec_name ?? null,
                filesize: format.size ? parseInt(format.size) : null,
                formatName: format.format_name ?? null,
                bitRate: format.bit_rate ? parseInt(format.bit_rate) : null,
            });
        }
        catch (error) {
            return toolError(`Failed to get media info: ${error.message}`);
        }
    });
    server.registerTool("extract_frames", {
        title: "Extract Frames",
        description: "Extract frames/screenshots from a local video file at regular intervals. Returns images as base64 that Claude can see and analyze.",
        inputSchema: {
            file_path: z.string().describe("Absolute path to a local video file"),
            interval_seconds: z
                .number()
                .default(30)
                .describe("Seconds between each frame capture (default: 30)"),
            max_frames: z
                .number()
                .default(10)
                .describe("Maximum number of frames to extract (default: 10)"),
            format: z
                .enum(["jpg", "png"])
                .default("jpg")
                .describe("Output image format (default: 'jpg')"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, async ({ file_path, interval_seconds, max_frames, format }) => {
        const tempDir = await createTempDir();
        try {
            const framesDir = join(tempDir, "frames");
            const { stdout: durationOut } = await execCommand("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file_path], { timeout: 10_000 });
            const duration = parseFloat(durationOut.trim());
            const totalPossibleFrames = Math.floor(duration / interval_seconds) + 1;
            const actualInterval = totalPossibleFrames > max_frames
                ? Math.ceil(duration / max_frames)
                : interval_seconds;
            await execCommand("mkdir", ["-p", framesDir]);
            await execCommand("ffmpeg", [
                "-i", file_path,
                "-vf", `fps=1/${actualInterval}`,
                "-frames:v", String(max_frames),
                "-q:v", "2",
                join(framesDir, `frame_%04d.${format}`),
            ], { timeout: 120_000 });
            const files = await readdir(framesDir);
            const frameFiles = files
                .filter((f) => f.startsWith("frame_") && f.endsWith(`.${format}`))
                .sort();
            const frames = [];
            for (let i = 0; i < frameFiles.length; i++) {
                const filePath = join(framesDir, frameFiles[i]);
                const base64 = await readFileAsBase64(filePath);
                frames.push({
                    base64,
                    mimeType: format === "jpg" ? "image/jpeg" : "image/png",
                    timestamp: i * actualInterval,
                });
            }
            if (frames.length === 0) {
                return toolResult({
                    message: "No frames could be extracted from the video",
                    filePath: file_path,
                });
            }
            const metadata = {
                frameCount: frames.length,
                intervalSeconds: actualInterval,
                format,
                timestamps: frames.map((f) => f.timestamp),
                duration,
                filePath: file_path,
            };
            return toolResultWithImages(metadata, frames.map((f) => ({ base64: f.base64, mimeType: f.mimeType })));
        }
        catch (error) {
            return toolError(`Failed to extract frames: ${error.message}`);
        }
        finally {
            await cleanupTempDir(tempDir);
        }
    });
    server.registerTool("extract_audio", {
        title: "Extract Audio",
        description: "Extract/convert audio from a local video file to MP3. Returns the path to the extracted audio file.",
        inputSchema: {
            file_path: z.string().describe("Absolute path to a local video file"),
            output_dir: z
                .string()
                .optional()
                .describe("Output directory (default: system temp dir)"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, async ({ file_path, output_dir }) => {
        let tempDir = null;
        try {
            const dir = output_dir ?? (tempDir = await createTempDir());
            const audioPath = join(dir, "audio.mp3");
            await execCommand("ffmpeg", ["-i", file_path, "-vn", "-acodec", "libmp3lame", "-q:a", "5", "-y", audioPath], { timeout: 120_000 });
            return toolResult({
                filePath: audioPath,
                source: file_path,
                format: "mp3",
                temporary: !output_dir,
            });
        }
        catch (error) {
            if (tempDir)
                await cleanupTempDir(tempDir);
            return toolError(`Failed to extract audio: ${error.message}`);
        }
    });
    server.registerTool("split_audio", {
        title: "Split Audio",
        description: "Split an audio file into chunks of N minutes. Returns paths to all chunk files. Useful for processing large files that exceed API size limits.",
        inputSchema: {
            file_path: z.string().describe("Absolute path to a local audio file"),
            chunk_minutes: z
                .number()
                .default(10)
                .describe("Duration of each chunk in minutes (default: 10)"),
            output_dir: z
                .string()
                .optional()
                .describe("Output directory (default: system temp dir)"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
        },
    }, async ({ file_path, chunk_minutes, output_dir }) => {
        let tempDir = null;
        try {
            const dir = output_dir ?? (tempDir = await createTempDir());
            const chunkDuration = chunk_minutes * 60;
            const { stdout: durationOut } = await execCommand("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file_path], { timeout: 10_000 });
            const totalDuration = parseFloat(durationOut.trim());
            const totalChunks = Math.ceil(totalDuration / chunkDuration);
            const chunks = [];
            for (let i = 0; i < totalChunks; i++) {
                const startTime = i * chunkDuration;
                const chunkPath = join(dir, `chunk_${String(i).padStart(3, "0")}.mp3`);
                await execCommand("ffmpeg", [
                    "-i", file_path,
                    "-ss", String(startTime),
                    "-t", String(chunkDuration),
                    "-vn",
                    "-acodec", "libmp3lame",
                    "-q:a", "5",
                    "-y",
                    chunkPath,
                ], { timeout: 60_000 });
                chunks.push(chunkPath);
            }
            return toolResult({
                chunks,
                totalChunks: chunks.length,
                chunkMinutes: chunk_minutes,
                totalDuration,
                source: file_path,
                temporary: !output_dir,
            });
        }
        catch (error) {
            if (tempDir)
                await cleanupTempDir(tempDir);
            return toolError(`Failed to split audio: ${error.message}`);
        }
    });
}
