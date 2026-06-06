// Render a 1080x1920 share poster on the client via Canvas.
// Returns a PNG Blob suitable for downloading + uploading to IG / TikTok.

export async function renderPoster(result) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0e1622');
  grad.addColorStop(1, '#0b0f14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#5cf2c0';
  ctx.font = '700 36px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('good-bot · niceness card', W / 2, 140);

  // Persona face (emoji at huge size)
  ctx.font = '300px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", system-ui';
  ctx.fillStyle = '#fff';
  ctx.fillText(result.persona.emoji || '🤖', W / 2, 480);

  // Persona name
  ctx.font = '700 96px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  wrapText(ctx, result.persona.name.toUpperCase(), W / 2, 620, W - 80, 100);

  // Tag
  if (result.persona.tag) {
    ctx.font = 'italic 400 42px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    wrapText(ctx, '"' + result.persona.tag + '"', W / 2, 820, W - 100, 56);
  }

  // Niceness bar
  const barW = 800, barH = 28;
  const barX = (W - barW) / 2, barY = 1080;
  ctx.fillStyle = '#19222f';
  roundRect(ctx, barX, barY, barW, barH, 14);
  ctx.fill();
  const fill = Math.round((result.niceness / 100) * barW);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, '#ff6b6b');
  barGrad.addColorStop(0.5, '#ffb86c');
  barGrad.addColorStop(1, '#5cf2c0');
  ctx.fillStyle = barGrad;
  roundRect(ctx, barX, barY, fill, barH, 14);
  ctx.fill();

  ctx.font = '600 36px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#8b9cb0';
  ctx.fillText(`${result.niceness} / 100 · ${result.scale} scale`, W / 2, 1170);

  // Blurb
  if (result.persona.blurb) {
    ctx.font = '400 36px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    wrapText(ctx, result.persona.blurb, W / 2, 1320, W - 120, 50);
  }

  // CTA + hashtag
  ctx.font = '700 40px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#5cf2c0';
  ctx.fillText('How nice are YOU to your AI?', W / 2, 1700);
  ctx.font = '400 32px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#8b9cb0';
  ctx.fillText('goodbot.dev · #BeNiceToYourAI', W / 2, 1760);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  // Limit to 4 lines so the poster doesn't run off the canvas
  const draw = lines.slice(0, 4);
  draw.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
