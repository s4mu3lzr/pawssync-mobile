import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(serverDirectory, 'generated');
const collarTokens = {
  morita: 'QR_MORITA_12345',
  darla: 'QR_DARLA_67890',
};
const args = process.argv.slice(2);
const petId = args[0] ?? 'morita';
let payload;
let outputName = petId;
if (['register', 'morita-nueva', 'galleta', 'darla-nueva'].includes(petId)) {
  const pet = petId === 'morita-nueva'
    ? { name: 'Morita', breed: 'Mestiza', birth_date: '2023-01-15', address: '', contact_phone: '' }
    : petId === 'galleta'
      ? {
          name: 'Galleta',
          breed: 'Cocker Spaniel',
          birth_date: '2022-04-12',
          address: 'Calle de Prueba 123, Centro, Querétaro, Qro.',
          contact_phone: '+12025550147',
        }
        : petId === 'darla-nueva'
        ? {
            name: 'Darla',
            breed: 'Labrador Retriever',
            birth_date: '2021-09-20',
            address: 'Avenida de Prueba 456, Centro, Querétaro, Qro.',
            contact_phone: '+12025550148',
          }
      : {
          name: args[1],
          breed: args[2],
          birth_date: args[3] ?? '',
          address: args[4] ?? '',
          contact_phone: args[5] ?? '',
        };
  if (!pet.name?.trim() || !pet.breed?.trim()) {
    throw new Error('Para un QR nuevo indica nombre y raza: npm run qr:register -- "Nombre" "Raza" ["AAAA-MM-DD"].');
  }
  if (pet.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(pet.birth_date)) {
    throw new Error('La fecha opcional debe tener formato AAAA-MM-DD.');
  }
  if (pet.birth_date) {
    const parsedBirthDate = new Date(`${pet.birth_date}T00:00:00`);
    if (
      Number.isNaN(parsedBirthDate.getTime()) ||
      parsedBirthDate.toISOString().slice(0, 10) !== pet.birth_date ||
      parsedBirthDate.getTime() > Date.now()
    ) {
      throw new Error('La fecha de nacimiento no es válida o está en el futuro.');
    }
  }
  const token = `QR_${randomUUID().replaceAll('-', '').toUpperCase()}`;
  payload = `pawssync://register?${new URLSearchParams({
    name: pet.name.trim(),
    breed: pet.breed.trim(),
    ...(pet.birth_date ? { birth_date: pet.birth_date } : {}),
    ...(pet.address?.trim() ? { address: pet.address.trim() } : {}),
    ...(pet.contact_phone?.trim() ? { contact_phone: pet.contact_phone.trim() } : {}),
    token,
  }).toString()}`;
  outputName = ['morita-nueva', 'galleta', 'darla-nueva'].includes(petId) ? petId : pet.name;
  console.log(`Token de registro de un solo uso: ${token}`);
} else {
  const qrToken = Object.hasOwn(collarTokens, petId) ? collarTokens[petId] : process.argv[3];
  if (!qrToken) {
    throw new Error('Indica morita, darla, morita-nueva, galleta, darla-nueva o un token registrado: npm run qr -- nombre TOKEN.');
  }
  const configuredPublicUrl = process.env['PAWSSYNC_PUBLIC_URL'];
  if (!configuredPublicUrl) {
    throw new Error('Define PAWSSYNC_PUBLIC_URL para generar un QR público de vinculación.');
  }
  const publicBaseUrl = new URL(configuredPublicUrl);
  if (publicBaseUrl.protocol !== 'https:' && publicBaseUrl.hostname !== 'localhost') {
    throw new Error('PAWSSYNC_PUBLIC_URL debe usar HTTPS (se permite HTTP solo en localhost).');
  }
  publicBaseUrl.pathname = `${publicBaseUrl.pathname.replace(/\/+$/, '')}/`;
  payload = new URL(`public/pet/${encodeURIComponent(qrToken)}`, publicBaseUrl).toString();
}
outputName = outputName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
const outputPath = join(outputDirectory, `${outputName}-collar.png`);

await mkdir(outputDirectory, { recursive: true });
await QRCode.toFile(outputPath, payload, {
  errorCorrectionLevel: 'H',
  margin: 3,
  width: 500,
});

console.log(`QR generado: ${outputPath}`);
console.log(`Texto que contiene: ${payload}`);
