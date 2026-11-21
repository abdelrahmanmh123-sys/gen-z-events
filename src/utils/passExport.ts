import QRCode from 'qrcode';
import type { Booking } from '../types';
import { fitPosterDimensions, MAX_POSTER_DATA_URL_LENGTH } from './bookingLogic';

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
    width: 320,
    margin: 2,
    color: {
      dark: '#08090C',
      light: '#FFFFFF',
    },
  });
}

export async function renderTicketPassPng(booking: Booking): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 920, 500);
  bgGrad.addColorStop(0, '#0D1017');
  bgGrad.addColorStop(0.6, '#151926');
  bgGrad.addColorStop(1, '#1F1020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 920, 500);

  // Accent bar
  const accentGrad = ctx.createLinearGradient(0, 0, 920, 0);
  accentGrad.addColorStop(0, '#F43F5E');
  accentGrad.addColorStop(1, '#F59E0B');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, 920, 8);

  // Outer border
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 22, 884, 456);

  // Perforation line
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(610, 32);
  ctx.lineTo(610, 468);
  ctx.stroke();
  ctx.setLineDash([]);

  // Brand header
  ctx.fillStyle = '#F43F5E';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('GEN Z EVENTS  ·  QENA LIVE', 46, 72);

  // Concert Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(booking.concertTitle.slice(0, 30), 46, 126);

  // Venue & Date
  ctx.fillStyle = '#D1D5DB';
  ctx.font = '18px sans-serif';
  ctx.fillText(`${booking.concertDate}  ·  ${booking.concertTime}`, 46, 166);
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '16px sans-serif';
  ctx.fillText(booking.concertVenue.slice(0, 48), 46, 196);

  // Meta grid
  const drawField = (label: string, val: string, x: number, y: number, color = '#FFFFFF') => {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = color;
    ctx.font = 'bold 19px monospace';
    ctx.fillText(val, x, y + 26);
  };

  drawField('PASS TIER', booking.tier.toUpperCase(), 46, 252, '#FBBF24');
  drawField('ADMITS', `${booking.quantity} GUEST${booking.quantity > 1 ? 'S' : ''}`, 230, 252);
  drawField('TOTAL PAID', `${booking.totalEgp.toLocaleString()} EGP`, 400, 252, '#34D399');

  drawField('TICKET HOLDER', booking.customerName.slice(0, 24), 46, 340);
  drawField('PAYMENT', booking.paymentStatus.toUpperCase(), 400, 340, booking.paymentStatus === 'Paid' ? '#34D399' : '#FBBF24');

  // Footer note
  ctx.fillStyle = '#6B7280';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Booking Ref: ${booking.bookingCode}  ·  Transfer: ${booking.transferRef}`, 46, 444);

  // Right stub QR panel
  ctx.fillStyle = '#9CA3AF';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GATE SCAN PASS', 756, 74);

  if (booking.paymentStatus === 'Paid') {
    const qrUrl = await generateQrDataUrl(booking.bookingCode);
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(646, 98, 220, 220);
        ctx.drawImage(img, 654, 106, 204, 204);
        resolve();
      };
      img.onerror = () => reject(new Error('QR draw failed'));
      img.src = qrUrl;
    });
  } else {
    ctx.fillStyle = 'rgba(245,158,11,0.12)';
    ctx.fillRect(646, 98, 220, 220);
    ctx.strokeStyle = 'rgba(245,158,11,0.45)';
    ctx.strokeRect(646, 98, 220, 220);
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('QR LOCKED', 756, 198);
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '13px sans-serif';
    ctx.fillText('Awaiting Verification', 756, 224);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(booking.bookingCode, 756, 368);

  ctx.fillStyle = booking.checkedIn ? '#34D399' : '#9CA3AF';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(booking.checkedIn ? 'CHECKED IN' : 'VALID AT QENA GATE', 756, 404);
  ctx.textAlign = 'left';

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
