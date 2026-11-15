// Records the demo video: narrated walkthrough of the real app + result slides.
//   node submission/video/record.mjs            (app must be running on APP_URL, default http://localhost:3100)
// Requires: playwright-core (uses installed Chrome), python -m edge_tts, ffmpeg/ffprobe on PATH or FFMPEG_DIR.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "submission", "video");
const WORK = path.join(OUT, ".work");
const APP = process.env.APP_URL ?? "http://localhost:3100";
const VOICE = process.env.VOICE ?? "en-US-AriaNeural";
const FF = process.env.FFMPEG_DIR ? (n) => path.join(process.env.FFMPEG_DIR, n) : (n) => n;
const scenes = JSON.parse(readFileSync(path.join(OUT, "scenes.json"), "utf8"));
const ids = JSON.parse(readFileSync(path.join(OUT, "ids.json"), "utf8"));
const SLIDES = pathToFileURL(path.join(ROOT, "submission", "slides.html")).href;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// 1) Narration audio per scene, and its duration.
for (const [i, s] of scenes.entries()) {
  const mp3 = path.join(WORK, `n${i}.mp3`);
  if (!s.narration.trim()) {
    // Silent beat: a short pause with no narration.
    execFileSync(FF("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(s.minSeconds ?? 0.5), mp3]);
  } else {
    execFileSync("python", ["-m", "edge_tts", "--voice", VOICE, "--rate", "+4%", "--text", s.narration, "--write-media", mp3], { stdio: "ignore" });
  }
  s.audio = mp3;
  s.seconds = Number(execFileSync(FF("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString().trim());
  s.hold = s.narration.trim() ? Math.max(s.minSeconds ?? 0, s.seconds + 0.9) : s.seconds;
}
console.log(`Narration: ${scenes.reduce((a, s) => a + s.hold, 0).toFixed(0)} s total`);

// 2) Screen recording, holding each scene for its narration.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: WORK, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
const actions = {
  async slide(arg) { await page.goto(`${SLIDES}#${arg}`); await wait(400); },
  async home() {
    await page.goto(APP);
    const box = page.getByRole("textbox").first();
    await box.click();
    await box.pressSequentially(ids.homeQuestion, { delay: 28 });
  },
  async overview() { await page.goto(`${APP}/d/${ids.clean}`); await wait(1500); },
  async poisonedConflicts() { await page.goto(`${APP}/d/${ids.poisoned}`); await wait(1500); await tab("Conflicts"); await wait(500); },
  async drawer() {
    const chip = page.locator("button[aria-label^=\"Open \"][aria-label*=\" claim from \"]").first();
    await chip.click().catch(() => {});
    await wait(800);
  },
  async closeDrawer() { await page.keyboard.press("Escape"); await wait(300); },
  async evidence() { await tab("Evidence"); await wait(600); await page.mouse.move(1000, 500); await page.mouse.wheel(0, 500); },
  async compare() {
    await tab("Compare");
    await wait(700);
    const slider = page.getByRole("slider").first();
    await slider.focus();
    for (let k = 0; k < 12; k++) { await page.keyboard.press("ArrowLeft"); await wait(90); }
    await wait(900);
    const second = page.getByRole("slider").nth(1);
    await second.focus();
    for (let k = 0; k < 12; k++) { await page.keyboard.press("ArrowRight"); await wait(90); }
  },
  async conflicts() { await tab("Conflicts"); await wait(600); },
  async sources() { await tab("Sources"); await wait(600); await page.mouse.move(1000, 500); await page.mouse.wheel(0, 300); },
  async audit() {
    await tab("Audit");
    await wait(600);
    await page.getByRole("button", { name: /verify integrity/i }).click().catch(() => {});
  },
};
for (const s of scenes) {
  const started = Date.now();
  const [name, arg] = s.action.split(":");
  await actions[name](arg).catch((e) => console.warn(`scene ${s.action}: ${e.message}`));
  const left = s.hold * 1000 - (Date.now() - started);
  if (left > 0) await wait(left);
}
const videoPath = await page.video().path();
await context.close();
await browser.close();

// 3) Audio track padded to each scene's hold time, then mux.
const parts = scenes.map((s, i) => {
  const out = path.join(WORK, `p${i}.wav`);
  execFileSync(FF("ffmpeg"), ["-y", "-v", "error", "-i", s.audio, "-af", `apad=whole_dur=${s.hold.toFixed(3)}`, "-ar", "44100", "-ac", "2", out]);
  return out;
});
writeFileSync(path.join(WORK, "list.txt"), parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
const audio = path.join(WORK, "audio.wav");
execFileSync(FF("ffmpeg"), ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(WORK, "list.txt"), "-c", "copy", audio]);
const final = path.join(OUT, "decision-ai-demo.mp4");
execFileSync(FF("ffmpeg"), ["-y", "-v", "error", "-i", videoPath, "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", final]);
console.log(`Video: ${final}`);
if (existsSync(videoPath)) renameSync(videoPath, path.join(WORK, "screen.webm"));
void readdirSync;
