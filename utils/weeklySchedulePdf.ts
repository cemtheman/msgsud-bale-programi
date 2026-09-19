import { Category, Lesson } from '@/types/schedule';
import { getSubjectCategory } from '@/utils/schedule';

export interface WeeklyPdfDay {
  label: string;
  lessons: Lesson[];
}

export interface WeeklyPdfSlot {
  start: string;
  end: string;
  kind: 'lesson' | 'lunch';
}

interface WeeklySchedulePdfOptions {
  schoolName: string;
  className: string;
  scheduleTitle?: string;
  days: WeeklyPdfDay[];
  slots: WeeklyPdfSlot[];
  lunchLabel: string;
  logo?: HTMLImageElement | null;
}

const WIDTH = 3508;
const HEIGHT = 2480;
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const encoder = new TextEncoder();

const COLORS = {
  ink: '#111b43',
  mutedInk: '#33415f',
  background: '#fffaf5',
  empty: '#e5e7eb',
  time: '#eef0f4',
  academic: '#ffe18a',
  dance: '#8ed3f5',
  other: '#b9a5ef',
  lunch: '#f4a7cf',
  day: ['#f4cce8', '#bdddf3', '#c9eadf', '#d7c7f5', '#f1d3aa'],
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight = 700,
) {
  let size = startSize;
  while (size > 21) {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function drawIcon(
  context: CanvasRenderingContext2D,
  kind: Category | 'lunch' | 'empty',
  centerX: number,
  centerY: number,
  size: number,
) {
  context.save();
  context.strokeStyle = COLORS.ink;
  context.fillStyle = COLORS.ink;
  context.lineWidth = Math.max(3, size * 0.075);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (kind === 'academic') {
    const half = size * 0.38;
    context.beginPath();
    context.moveTo(centerX, centerY + size * 0.35);
    context.quadraticCurveTo(centerX - half * 0.55, centerY + size * 0.08, centerX - half, centerY + size * 0.2);
    context.lineTo(centerX - half, centerY - size * 0.32);
    context.quadraticCurveTo(centerX - half * 0.45, centerY - size * 0.42, centerX, centerY - size * 0.12);
    context.quadraticCurveTo(centerX + half * 0.45, centerY - size * 0.42, centerX + half, centerY - size * 0.32);
    context.lineTo(centerX + half, centerY + size * 0.2);
    context.quadraticCurveTo(centerX + half * 0.55, centerY + size * 0.08, centerX, centerY + size * 0.35);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX, centerY - size * 0.12);
    context.lineTo(centerX, centerY + size * 0.35);
    context.stroke();
  } else if (kind === 'dance') {
    context.beginPath();
    context.ellipse(centerX - size * 0.2, centerY, size * 0.14, size * 0.38, 0.25, 0, Math.PI * 2);
    context.ellipse(centerX + size * 0.2, centerY, size * 0.14, size * 0.38, -0.25, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX - size * 0.28, centerY - size * 0.4);
    context.lineTo(centerX, centerY - size * 0.05);
    context.lineTo(centerX + size * 0.28, centerY - size * 0.4);
    context.stroke();
  } else if (kind === 'lunch') {
    context.beginPath();
    context.moveTo(centerX - size * 0.22, centerY - size * 0.36);
    context.lineTo(centerX - size * 0.22, centerY + size * 0.36);
    context.moveTo(centerX - size * 0.36, centerY - size * 0.36);
    context.lineTo(centerX - size * 0.36, centerY - size * 0.04);
    context.quadraticCurveTo(centerX - size * 0.22, centerY + size * 0.1, centerX - size * 0.08, centerY - size * 0.04);
    context.lineTo(centerX - size * 0.08, centerY - size * 0.36);
    context.moveTo(centerX + size * 0.25, centerY - size * 0.36);
    context.lineTo(centerX + size * 0.25, centerY + size * 0.36);
    context.stroke();
  } else if (kind === 'other') {
    const r = size * 0.1;
    [[-0.2, -0.18], [0.2, -0.18], [0, -0.28]].forEach(([dx, dy]) => {
      context.beginPath();
      context.arc(centerX + size * dx, centerY + size * dy, r, 0, Math.PI * 2);
      context.stroke();
    });
    context.beginPath();
    context.arc(centerX, centerY + size * 0.18, size * 0.32, Math.PI, Math.PI * 2);
    context.stroke();
  } else {
    context.setLineDash([7, 6]);
    context.beginPath();
    context.arc(centerX, centerY, size * 0.34, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawLesson(
  context: CanvasRenderingContext2D,
  lesson: Lesson,
  slot: WeeklyPdfSlot,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const category = getSubjectCategory(lesson.subject, lesson.target);
  roundedRect(context, x, y, width, height, 18, COLORS[category]);
  const iconSize = Math.min(48, height * 0.54);
  drawIcon(context, category, x + 38, y + height / 2, iconSize);

  const textX = x + 73;
  const textWidth = width - 88;
  context.textAlign = 'left';
  const classLabel = lesson.classCodes?.length
    ? lesson.classCodes.join(' - ')
    : lesson.classCode;
  const classAndLocation = classLabel
    ? [classLabel, lesson.location].filter(Boolean).join(' ')
    : undefined;
  const details = [
    classAndLocation,
    lesson.subgroup,
    classLabel ? undefined : lesson.teacher,
    classLabel ? undefined : lesson.location,
    lesson.end !== slot.end ? `${lesson.start}-${lesson.end}` : undefined,
  ].filter(Boolean).join(' / ');
  const titleSize = fitText(context, lesson.subject, textWidth, 31, 700);
  context.fillStyle = COLORS.ink;
  context.font = `700 ${titleSize}px Arial, sans-serif`;
  context.textBaseline = 'middle';
  context.fillText(lesson.subject, textX, details ? y + height * 0.38 : y + height / 2, textWidth);
  if (details) {
    const detailSize = fitText(context, details, textWidth, 22, 400);
    context.fillStyle = COLORS.mutedInk;
    context.font = `400 ${detailSize}px Arial, sans-serif`;
    context.fillText(details, textX, y + height * 0.68, textWidth);
  }
}

function drawScheduleCanvas(options: WeeklySchedulePdfOptions) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF çizim alanı oluşturulamadı.');

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const margin = 82;
  const contentWidth = WIDTH - margin * 2;
  const logoSize = 150;
  if (options.logo?.complete && options.logo.naturalWidth > 0) {
    context.drawImage(options.logo, margin, 58, logoSize, 102);
  }

  context.fillStyle = COLORS.ink;
  const headingX = margin + (options.logo?.complete ? logoSize + 28 : 0);
  const headingWidth = contentWidth - (headingX - margin);
  const headingSize = fitText(context, options.schoolName, headingWidth, 52, 700);
  context.font = `700 ${headingSize}px Georgia, serif`;
  context.textBaseline = 'top';
  context.fillText(options.schoolName, headingX, 64, headingWidth);
  context.font = '400 40px Georgia, serif';
  context.fillText(options.scheduleTitle ?? `${options.className} Sınıfı Ders Programı`, headingX, 120, headingWidth);

  const tableTop = 205;
  const headerHeight = 92;
  const legendHeight = 78;
  const legendTop = HEIGHT - margin - legendHeight;
  const availableRowsHeight = legendTop - tableTop - headerHeight - 24;
  const rowGap = 8;
  const rowHeight = Math.floor((availableRowsHeight - rowGap * (options.slots.length - 1)) / options.slots.length);
  const columnGap = 8;
  const timeWidth = 390;
  const dayWidth = (contentWidth - timeWidth - columnGap * 5) / 5;
  const columnX = (index: number) => margin + timeWidth + columnGap + index * (dayWidth + columnGap);

  roundedRect(context, margin, tableTop, timeWidth, headerHeight, 18, COLORS.time);
  context.fillStyle = COLORS.ink;
  context.font = '700 31px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('SAAT', margin + timeWidth / 2, tableTop + headerHeight / 2);

  options.days.forEach((day, index) => {
    const x = columnX(index);
    roundedRect(context, x, tableTop, dayWidth, headerHeight, 18, COLORS.day[index] ?? COLORS.time);
    context.fillStyle = COLORS.ink;
    context.font = '700 31px Arial, sans-serif';
    context.fillText(day.label.toLocaleUpperCase('tr-TR'), x + dayWidth / 2, tableTop + headerHeight / 2, dayWidth - 24);
  });

  options.slots.forEach((slot, rowIndex) => {
    const y = tableTop + headerHeight + 10 + rowIndex * (rowHeight + rowGap);
    const rowColor = slot.kind === 'lunch' ? COLORS.lunch : COLORS.time;
    roundedRect(context, margin, y, timeWidth, rowHeight, 16, rowColor);
    context.fillStyle = COLORS.ink;
    context.font = '700 25px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText(`${slot.start} - ${slot.end}`, margin + timeWidth / 2, y + rowHeight / 2);

    options.days.forEach((day, dayIndex) => {
      const x = columnX(dayIndex);
      if (slot.kind === 'lunch') {
        roundedRect(context, x, y, dayWidth, rowHeight, 16, COLORS.lunch);
        drawIcon(context, 'lunch', x + dayWidth * 0.34, y + rowHeight / 2, 42);
        context.fillStyle = COLORS.ink;
        context.textAlign = 'center';
        context.font = '700 25px Arial, sans-serif';
        context.fillText(options.lunchLabel.toLocaleUpperCase('tr-TR'), x + dayWidth * 0.6, y + rowHeight / 2, dayWidth * 0.55);
        return;
      }

      const lessons = day.lessons.filter((lesson) => lesson.start === slot.start);
      if (lessons.length === 0) {
        roundedRect(context, x, y, dayWidth, rowHeight, 16, COLORS.empty);
        return;
      }

      const lessonGap = lessons.length > 1 ? 4 : 0;
      const lessonHeight = (rowHeight - lessonGap * (lessons.length - 1)) / lessons.length;
      lessons.forEach((lesson, lessonIndex) => {
        drawLesson(context, lesson, slot, x, y + lessonIndex * (lessonHeight + lessonGap), dayWidth, lessonHeight);
      });
    });
  });

  const legendItems: Array<{ label: string; kind: Category | 'lunch' | 'empty'; color: string }> = [
    { label: 'Kültür Dersleri', kind: 'academic', color: COLORS.academic },
    { label: 'Sanat Dersleri', kind: 'dance', color: COLORS.dance },
    { label: 'Kulüp Dersleri', kind: 'other', color: COLORS.other },
    { label: 'Yemek Arası', kind: 'lunch', color: COLORS.lunch },
    { label: 'Boş Saat', kind: 'empty', color: COLORS.empty },
  ];
  const legendGap = 18;
  const legendWidth = (contentWidth - legendGap * 4) / 5;
  legendItems.forEach((item, index) => {
    const x = margin + index * (legendWidth + legendGap);
    roundedRect(context, x, legendTop, legendWidth, legendHeight, 38, item.color);
    drawIcon(context, item.kind, x + 62, legendTop + legendHeight / 2, 42);
    context.fillStyle = COLORS.ink;
    context.font = '700 25px Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText(item.label, x + 98, legendTop + legendHeight / 2, legendWidth - 112);
  });

  return canvas;
}

function dataUrlToBytes(dataUrl: string) {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function joinBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function jpegToSinglePagePdf(jpeg: Uint8Array) {
  const objects: Uint8Array[] = [];
  const text = (value: string) => encoder.encode(value);
  objects.push(text('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  objects.push(text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  objects.push(joinBytes([
    text(`<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    text('\nendstream'),
  ]));
  const drawing = `q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ`;
  objects.push(text(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`));

  const parts: Uint8Array[] = [text('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')];
  const offsets = [0];
  let cursor = parts[0].length;
  objects.forEach((object, index) => {
    const prefix = text(`${index + 1} 0 obj\n`);
    const suffix = text('\nendobj\n');
    offsets.push(cursor);
    parts.push(prefix, object, suffix);
    cursor += prefix.length + object.length + suffix.length;
  });
  const xrefOffset = cursor;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join('');
  parts.push(text(xref));
  return joinBytes(parts);
}

export function createWeeklySchedulePdf(options: WeeklySchedulePdfOptions) {
  const canvas = drawScheduleCanvas(options);
  const jpeg = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.94));
  const pdf = jpegToSinglePagePdf(jpeg);
  return new Blob([pdf], { type: 'application/pdf' });
}

export async function shareOrDownloadWeeklySchedulePdf(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const shareData = { files: [file], title: fileName.replace(/\.pdf$/i, '') };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
