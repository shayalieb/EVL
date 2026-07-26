// Shared jsPDF drawing helpers used by proposalPdf.js, contractPdf.js, and
// invoicePdf.js. Pulled out because those three builders were (or would be)
// near-identical hand-drawn sequences differing only in body content — this
// is the one place a document layout's tokens (see documentLayouts.js)
// actually get turned into jsPDF draw calls, so adding a layout means
// describing its tokens once rather than repeating drawing logic per file.

export function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function scaleFont(base, scale) {
  return Math.max(1, Math.round(base * scale * 10) / 10);
}

export function setFontStyle(doc, layout, style = 'normal') {
  doc.setFont(layout.font, style);
}

// Logo + business name + contact line. Left-aligned layouts keep the classic
// left-anchored block; centered layouts stack everything centered on the
// page instead. Returns the y position content should resume at.
export async function drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName }) {
  setFontStyle(doc, layout, 'normal');
  const dims = businessInfo?.logo ? await loadImageDimensions(businessInfo.logo) : null;
  const contactLine = [businessInfo?.address, businessInfo?.phone, businessInfo?.email].filter(Boolean).join('   ·   ');
  const name = businessInfo?.name || fallbackName;

  const density = layout.density ?? 1;

  if (layout.headerAlign === 'center') {
    let cy = y;
    if (dims) {
      const h = 14;
      const w = h * (dims.width / dims.height);
      doc.addImage(businessInfo.logo, 'PNG', pageWidth / 2 - w / 2, cy - 10, w, h);
      cy += 8 * density;
    }
    doc.setFontSize(scaleFont(15, scale));
    doc.setTextColor(20);
    doc.text(name, pageWidth / 2, cy, { align: 'center' });
    cy += 6 * density;
    if (contactLine) {
      doc.setFontSize(scaleFont(9, scale));
      doc.setTextColor(110);
      doc.text(contactLine, pageWidth / 2, cy, { align: 'center' });
      cy += 5 * density;
    }
    return Math.max(cy, 28) + 4 * density;
  }

  let textX = marginX;
  if (dims) {
    const h = 16;
    const w = h * (dims.width / dims.height);
    doc.addImage(businessInfo.logo, 'PNG', marginX, y - 5, w, h);
    textX = marginX + w + 5;
  }
  doc.setFontSize(scaleFont(15, scale));
  doc.setTextColor(20);
  doc.text(name, textX, y);
  let ny = y + 6 * density;
  if (contactLine) {
    doc.setFontSize(scaleFont(9, scale));
    doc.setTextColor(110);
    doc.text(contactLine, textX, ny);
    ny += 5 * density;
  }
  return Math.max(ny, 28) + 4 * density;
}

// The rule under the letterhead. 'none' skips drawing but still leaves a
// (smaller) gap so content below doesn't crowd the header.
export function drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y }) {
  const { rule } = layout;
  const density = layout.density ?? 1;
  if (rule === 'none') return y + 6 * density;
  doc.setDrawColor(...accentRgb);
  if (rule === 'doubleThin') {
    doc.setLineWidth(0.25);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.line(marginX, y + 1.2, pageWidth - marginX, y + 1.2);
    doc.setLineWidth(0.2);
    return y + 11 * density;
  }
  doc.setLineWidth(rule === 'thin' ? 0.25 : 0.6);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.2);
  return y + (rule === 'thin' ? 9 : 11) * density;
}

// A custom section (title + optional value/text) — the one piece of visual
// identity that varies most across layouts: a solid accent bar, a thin
// left-border tab, an underline, or a boxed outline.
export function drawSectionBlock(doc, { section, layout, accentRgb, marginX, pageWidth, scale, y }) {
  if (y > 255) { doc.addPage(); y = 20; }
  const contentWidth = pageWidth - marginX * 2;
  const titleFont = scaleFont(10, scale);
  const density = layout.density ?? 1;
  setFontStyle(doc, layout, 'normal');

  switch (layout.sectionStyle) {
    case 'filledBarLarge': {
      const barH = 9.5;
      doc.setFillColor(...accentRgb);
      doc.rect(marginX, y, contentWidth, barH, 'F');
      doc.setFontSize(scaleFont(11, scale));
      doc.setTextColor(255);
      setFontStyle(doc, layout, 'bold');
      doc.text(section.title, marginX + 3, y + barH * 0.68);
      setFontStyle(doc, layout, 'normal');
      y += barH + 6 * density;
      break;
    }
    case 'leftBorder': {
      doc.setFillColor(...accentRgb);
      doc.rect(marginX, y, 1.2, 6, 'F');
      doc.setFontSize(titleFont);
      doc.setTextColor(30);
      doc.text(section.title, marginX + 4, y + 4.6);
      y += 6 + 6 * density;
      break;
    }
    case 'underline': {
      doc.setFontSize(titleFont);
      doc.setTextColor(30);
      doc.text(section.title, marginX, y + 4);
      doc.setDrawColor(...accentRgb);
      doc.setLineWidth(0.3);
      doc.line(marginX, y + 6, pageWidth - marginX, y + 6);
      doc.setLineWidth(0.2);
      y += 6 + 6 * density;
      break;
    }
    case 'boxedOutline': {
      const barH = 7.5;
      doc.setDrawColor(...accentRgb);
      doc.setLineWidth(0.4);
      doc.rect(marginX, y, contentWidth, barH);
      doc.setLineWidth(0.2);
      doc.setFontSize(titleFont);
      doc.setTextColor(30);
      doc.text(section.title, marginX + 3, y + 5.3);
      y += barH + 6 * density;
      break;
    }
    case 'filledBar':
    default: {
      const barH = 7.5;
      doc.setFillColor(...accentRgb);
      doc.rect(marginX, y, contentWidth, barH, 'F');
      doc.setFontSize(titleFont);
      doc.setTextColor(255);
      doc.text(section.title, marginX + 3, y + 5.3);
      y += barH + 6 * density;
      break;
    }
  }

  if (section.value) {
    doc.setFontSize(scaleFont(11, scale));
    doc.setTextColor(30);
    doc.text(section.value, marginX, y);
    y += 7 * density;
  }
  if (section.text) {
    doc.setFontSize(scaleFont(10, scale));
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(section.text, contentWidth);
    doc.text(lines, marginX, y);
    y += lines.length * 5 * density + 4 * density;
  }
  y += 4 * density;
  return y;
}

// Style object spread into every `autoTable()` call (head/body/columnStyles/
// startY/margin stay per-call since those depend on the table's content).
export function getAutoTableStyle(layout, scale, accentRgb) {
  const fontSize = scaleFont(10, scale);
  if (layout.tableTheme === 'plain') {
    return {
      theme: 'plain',
      styles: { fontSize },
      headStyles: { textColor: accentRgb, fontStyle: 'bold' },
    };
  }
  if (layout.tableTheme === 'grid') {
    return {
      theme: 'grid',
      styles: { fontSize },
      headStyles: { fillColor: accentRgb },
    };
  }
  if (layout.tableTheme === 'gridHeavy') {
    return {
      theme: 'grid',
      styles: { fontSize, cellPadding: 3 },
      headStyles: { fillColor: accentRgb, fontStyle: 'bold' },
    };
  }
  return {
    theme: 'striped',
    styles: { fontSize },
    headStyles: { fillColor: accentRgb },
  };
}
