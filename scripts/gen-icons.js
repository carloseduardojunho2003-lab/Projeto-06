// Gera ícones PNG para o PWA usando canvas (Node.js)
// Execute: node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');

// Ícone SVG embutido como base64 PNG via canvas-like approach
// Como não temos canvas nativo, vamos gerar um PNG mínimo válido

function createPNG(size) {
  // PNG mínimo com fundo #0a0e27 e texto "IA"
  // Usamos a biblioteca jimp se disponível, senão cria PNG básico
  try {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Fundo
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, size, size);

    // Círculo verde
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Fundo círculo interno
    ctx.fillStyle = '#0a0e27';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Texto
    ctx.fillStyle = '#00ff88';
    ctx.font = `bold ${Math.floor(size * 0.22)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IA', size / 2, size / 2 - size * 0.04);
    ctx.font = `bold ${Math.floor(size * 0.1)}px Arial`;
    ctx.fillStyle = '#4af';
    ctx.fillText('TRADER', size / 2, size / 2 + size * 0.18);

    return canvas.toBuffer('image/png');
  } catch {
    // Fallback: PNG 1x1 preto válido (placeholder)
    return Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e000000000c4944415478016360f8cfc000000002000173e163960000000049454e44ae426082',
      'hex'
    );
  }
}

const out = path.join(__dirname, '..');
fs.writeFileSync(path.join(out, 'icon-192.png'), createPNG(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), createPNG(512));
console.log('✅ Ícones gerados: icon-192.png e icon-512.png');
