import QRCode from 'qrcode';
import { BRAND_LOGO_PATH } from '../data/defaults';
import type { Booking } from '../types';
import { fitPosterDimensions, MAX_POSTER_DATA_URL_LENGTH } from './bookingLogic';
import {
  computeTicketStubRects,
  getTicketDesignForTier,
  QR_ORIGINAL_EXPORT_MARGIN,
  QR_ORIGINAL_EXPORT_SIZE,
  TICKET_CANVAS_HEIGHT,
  TICKET_CANVAS_WIDTH,
} from './ticketDesign';

export function playGateTone(kind: 'success' | 'warn' | 'error', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(990, now + 0.09);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.29);
    } else if (kind === 'warn') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.setValueAtTime(340, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.31);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.33);
    }
    setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        // ignore close error
      }
    }, 450);
  } catch {
    // ignore audio block
  }
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#08090C',
      light: '#FFFFFF',
    },
  });
}

export async function generateOriginalQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: QR_ORIGINAL_EXPORT_SIZE,
    margin: QR_ORIGINAL_EXPORT_MARGIN,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#08090C',
      light: '#FFFFFF',
    },
  });
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function renderTicketPassPng(booking: Booking, tierColorHex?: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = TICKET_CANVAS_WIDTH;
  canvas.height = TICKET_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  const design = getTicketDesignForTier(booking.tier);
  const safeTierHex =
    typeof tierColorHex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(tierColorHex)
      ? tierColorHex
      : design.accentHex;
  const rects = computeTicketStubRects(TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);

  let drewBackground = false;
  try {
    const bgImg = await loadCanvasImage(design.imagePath);
    ctx.drawImage(bgImg, 0, 0, TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);
    drewBackground = true;
  } catch {
    // Fallback cleanly to styled dark ticket card if artwork fails to load
  }

  if (!drewBackground) {
    const bgGrad = ctx.createLinearGradient(0, 0, TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);
    bgGrad.addColorStop(0, '#050608');
    bgGrad.addColorStop(0.65, '#0D0F14');
    bgGrad.addColorStop(1, design.stubBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);

    ctx.strokeStyle = safeTierHex;
    ctx.lineWidth = 3;
    drawRoundedRectPath(ctx, 14, 14, TICKET_CANVAS_WIDTH - 28, TICKET_CANVAS_HEIGHT - 28, 22);
    ctx.stroke();

    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(Math.round(TICKET_CANVAS_WIDTH * 0.747), 24);
    ctx.lineTo(Math.round(TICKET_CANVAS_WIDTH * 0.747), TICKET_CANVAS_HEIGHT - 24);
    ctx.stroke();
    ctx.setLineDash([]);

    let textX = 56;
    try {
      const logoImg = await loadCanvasImage(BRAND_LOGO_PATH);
      ctx.drawImage(logoImg, 56, 46, 52, 52);
      textX = 124;
    } catch {
      // text-only header fallback
    }
    ctx.fillStyle = '#E5E7EB';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`GEN Z EVENTS  ·  ${design.label}`, textX, 78);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(booking.concertTitle.slice(0, 34), 56, 178);

    ctx.fillStyle = '#D1D5DB';
    ctx.font = '22px sans-serif';
    ctx.fillText(`${booking.concertDate}  ·  ${booking.concertTime}`, 56, 226);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '20px sans-serif';
    ctx.fillText(booking.concertVenue.slice(0, 52), 56, 264);

    ctx.fillStyle = safeTierHex;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${booking.tier.toUpperCase()}  ·  ${booking.quantity}x  ·  ${booking.totalEgp.toLocaleString('en-US')} EGP`, 56, 344);

    ctx.fillStyle = '#E5E7EB';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(booking.customerName.slice(0, 34), 56, 404);
  }

  // Draw sleek rounded Digital QR Seal over the physical OFFICIAL STAMP circle
  ctx.save();
  const sealRadius = Math.round(rects.patch.w * 0.09);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  const sealGrad = ctx.createLinearGradient(
    rects.patch.x,
    rects.patch.y,
    rects.patch.x,
    rects.patch.y + rects.patch.h,
  );
  sealGrad.addColorStop(0, design.stubTop);
  sealGrad.addColorStop(0.55, '#090B10');
  sealGrad.addColorStop(1, design.stubBottom);
  ctx.fillStyle = sealGrad;
  drawRoundedRectPath(ctx, rects.patch.x, rects.patch.y, rects.patch.w, rects.patch.h, sealRadius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = design.accentHex;
  ctx.lineWidth = 2.5;
  drawRoundedRectPath(ctx, rects.patch.x, rects.patch.y, rects.patch.w, rects.patch.h, sealRadius);
  ctx.stroke();
  ctx.restore();

  if (booking.paymentStatus === 'Paid') {
    const qrUrl = await generateQrDataUrl(booking.bookingCode);
    const qrImg = await loadCanvasImage(qrUrl);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRectPath(
      ctx,
      rects.qrFrame.x,
      rects.qrFrame.y,
      rects.qrFrame.size,
      rects.qrFrame.size,
      rects.qrFrame.radius,
    );
    ctx.fill();
    ctx.restore();

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      qrImg,
      rects.qrImage.x,
      rects.qrImage.y,
      rects.qrImage.size,
      rects.qrImage.size,
    );
    ctx.imageSmoothingEnabled = prevSmooth;
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 9, 12, 0.65)';
    drawRoundedRectPath(
      ctx,
      rects.qrFrame.x,
      rects.qrFrame.y,
      rects.qrFrame.size,
      rects.qrFrame.size,
      rects.qrFrame.radius,
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('QR LOCKED', rects.codeText.centerX, rects.qrFrame.y + Math.round(rects.qrFrame.size * 0.46));
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      'Awaiting Verification',
      rects.codeText.centerX,
      rects.qrFrame.y + Math.round(rects.qrFrame.size * 0.6),
    );
    ctx.restore();
  }

  // Unique booking code centered cleanly below the QR
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${rects.codeText.fontSize}px monospace`;
  ctx.fillText(booking.bookingCode, rects.codeText.centerX, rects.codeText.baselineY);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopyText(text));
  }
  return Promise.resolve(fallbackCopyText(text));
}

function fallbackCopyText(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function triggerDataUrlDownload(filename: string, dataUrl: string) {
  try {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (match) {
      const mimeType = match[1];
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return;
    }
  } catch {
    // Fall back to direct data URL anchor download
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function compressPosterImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a JPG, PNG, or WebP image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const attempts: ReadonlyArray<{ maxWidth: number; quality: number }> = [
          { maxWidth: 760, quality: 0.74 },
          { maxWidth: 760, quality: 0.56 },
          { maxWidth: 580, quality: 0.5 },
          { maxWidth: 440, quality: 0.44 },
          { maxWidth: 320, quality: 0.38 },
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image.'));
          return;
        }

        for (const attempt of attempts) {
          const { width, height } = fitPosterDimensions(img.width, img.height, attempt.maxWidth);
          canvas.width = width;
          canvas.height = height;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', attempt.quality);
          if (dataUrl.length <= MAX_POSTER_DATA_URL_LENGTH) {
            resolve(dataUrl);
            return;
          }
        }

        reject(
          new Error(
            'Image is still too large after compression. Please pick a smaller or simpler poster image.',
          ),
        );
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}
