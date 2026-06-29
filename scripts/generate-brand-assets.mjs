import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BRAND_PURPLE = "#7C3AED";

const sources = {
  mark: path.join(root, "logo", "logo_without_text.png"),
  wordmark: path.join(root, "logo", "logo_with_text.png"),
};

const outputs = {
  desktopBranding: path.join(root, "apps", "desktop", "public", "branding"),
  desktopIcons: path.join(root, "apps", "desktop", "build", "icons"),
  desktopFavicon: path.join(root, "apps", "desktop", "public", "favicon.png"),
  mobileAssets: path.join(root, "apps", "mobile", "assets"),
  mobileBranding: path.join(root, "apps", "mobile", "assets", "branding"),
};

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function copyBrandingSources() {
  await ensureDir(outputs.desktopBranding);
  await ensureDir(outputs.mobileBranding);

  await copyFile(
    sources.mark,
    path.join(outputs.desktopBranding, "logo-mark.png"),
  );
  await copyFile(
    sources.wordmark,
    path.join(outputs.desktopBranding, "logo-wordmark.png"),
  );
  await copyFile(
    sources.mark,
    path.join(outputs.mobileBranding, "logo-mark.png"),
  );
  await copyFile(
    sources.wordmark,
    path.join(outputs.mobileBranding, "logo-wordmark.png"),
  );
}

async function resizeMark(size, paddingRatio = 0) {
  const meta = await sharp(sources.mark).metadata();
  const inner = Math.round(size * (1 - paddingRatio * 2));
  return sharp(sources.mark)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: Math.round((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.round((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: meta.hasAlpha
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 124, g: 58, b: 237, alpha: 1 },
    })
    .png()
    .toBuffer();
}

async function generateDesktopIcons() {
  await ensureDir(outputs.desktopIcons);

  const icon512 = await sharp(sources.mark).resize(512, 512).png().toBuffer();
  await writeFile(path.join(outputs.desktopIcons, "icon.png"), icon512);

  const favicon32 = await sharp(sources.mark).resize(32, 32).png().toBuffer();
  await writeFile(path.join(outputs.desktopIcons, "favicon.png"), favicon32);
  await writeFile(outputs.desktopFavicon, favicon32);

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map((s) => sharp(sources.mark).resize(s, s).png().toBuffer()),
  );
  const ico = await pngToIco(icoBuffers);
  await writeFile(path.join(outputs.desktopIcons, "icon.ico"), ico);
}

async function generateMobileAssets() {
  await ensureDir(outputs.mobileAssets);

  const icon1024 = await sharp(sources.mark)
    .resize(1024, 1024)
    .png()
    .toBuffer();
  await writeFile(path.join(outputs.mobileAssets, "icon.png"), icon1024);

  const favicon48 = await sharp(sources.mark).resize(48, 48).png().toBuffer();
  await writeFile(path.join(outputs.mobileAssets, "favicon.png"), favicon48);

  const splash = await sharp(sources.wordmark)
    .resize(400, 400, { fit: "inside" })
    .png()
    .toBuffer();
  await writeFile(path.join(outputs.mobileAssets, "splash-icon.png"), splash);

  const adaptiveForeground = await resizeMark(1024, 0.15);
  await writeFile(
    path.join(outputs.mobileAssets, "android-icon-foreground.png"),
    adaptiveForeground,
  );

  const adaptiveBackground = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: BRAND_PURPLE,
    },
  })
    .png()
    .toBuffer();
  await writeFile(
    path.join(outputs.mobileAssets, "android-icon-background.png"),
    adaptiveBackground,
  );

  const monochrome = await sharp(sources.mark)
    .resize(432, 432, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 296,
      bottom: 296,
      left: 296,
      right: 296,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .grayscale()
    .negate()
    .threshold(128)
    .png()
    .toBuffer();
  await writeFile(
    path.join(outputs.mobileAssets, "android-icon-monochrome.png"),
    monochrome,
  );
}

async function main() {
  console.log("Generating Pulse brand assets...");
  await copyBrandingSources();
  await generateDesktopIcons();
  await generateMobileAssets();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
