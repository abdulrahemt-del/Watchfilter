import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseVtt } from "../parseVtt";
import type { TranscriptFetchConfig } from "../types";
import type { TranscriptSegment } from "../../types";

const execFileAsync = promisify(execFile);

let ytDlpAvailable: boolean | null = null;

export async function isYtDlpAvailable(ytDlpPath: string): Promise<boolean> {
  if (ytDlpAvailable !== null) return ytDlpAvailable;

  try {
    await execFileAsync(ytDlpPath, ["--version"], { timeout: 8_000 });
    ytDlpAvailable = true;
  } catch {
    ytDlpAvailable = false;
  }

  return ytDlpAvailable;
}

async function findVttFile(dir: string, videoId: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  const vttFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".vtt"))
    .map((e) => e.name);

  const preferred =
    vttFiles.find((f) => f.startsWith(videoId) && f.includes(".en")) ??
    vttFiles.find((f) => f.includes(".en")) ??
    vttFiles[0];

  return preferred ? join(dir, preferred) : null;
}

export async function fetchTranscriptViaYtDlp(
  videoId: string,
  config: TranscriptFetchConfig,
  proxy: string | null,
): Promise<TranscriptSegment[]> {
  const available = await isYtDlpAvailable(config.ytDlpPath);
  if (!available) {
    throw new Error(
      `${config.ytDlpPath} is not installed or not on PATH. Install yt-dlp for production transcript extraction.`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "watchfilter-ytdlp-"));
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = join(workDir, "%(id)s");

  const args = [
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    config.preferredLanguages.join(","),
    "--sub-format",
    "vtt/best",
    "--convert-subs",
    "vtt",
    "--no-playlist",
    "--no-warnings",
    "-o",
    outputTemplate,
    watchUrl,
  ];

  if (proxy) {
    args.unshift("--proxy", proxy);
  }

  try {
    await execFileAsync(config.ytDlpPath, args, {
      timeout: config.ytDlpTimeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });

    const vttPath = await findVttFile(workDir, videoId);
    if (!vttPath) {
      throw new Error(
        "yt-dlp completed but no VTT subtitle file was produced. Captions may be disabled.",
      );
    }

    const vtt = await readFile(vttPath, "utf8");
    const segments = parseVtt(vtt);

    if (segments.length === 0) {
      throw new Error("yt-dlp subtitle file parsed to zero segments.");
    }

    return segments;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
