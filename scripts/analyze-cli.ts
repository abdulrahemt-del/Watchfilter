/**
 * Usage: npm run analyze -- "https://www.youtube.com/watch?v=VIDEO_ID"
 */
import { analyzeYouTubeVideo } from "../src/lib/analyzeVideo";

const url = process.argv[2];

if (!url) {
  console.error('Usage: npm run analyze -- "<youtube-url>"');
  process.exit(1);
}

analyzeYouTubeVideo(url)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
