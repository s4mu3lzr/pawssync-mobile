import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import initSqlJs from 'sql.js';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const databaseDirectory = join(serverDirectory, 'data');
const databasePath = join(databaseDirectory, 'pawssync.sqlite');
const port = Number(process.env.PORT ?? 3000);
const app = express();
const SQL = await initSqlJs({
  locateFile: (file) => join(serverDirectory, '..', 'node_modules', 'sql.js', 'dist', file),
});

await mkdir(databaseDirectory, { recursive: true });

let database;
try {
  database = new SQL.Database(await readFile(databasePath));
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }

  database = new SQL.Database();
}

database.run(`
  CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age TEXT NOT NULL,
    breed TEXT NOT NULL,
    avatar TEXT NOT NULL,
    medical_history TEXT NOT NULL,
    collar_token TEXT NOT NULL UNIQUE,
    linked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS walks (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL
  );
`);

database.run(`
  INSERT OR IGNORE INTO pets
    (id, name, age, breed, avatar, medical_history, collar_token, linked_at)
  VALUES
    ('morita', 'Morita', '3 años', 'Mestiza', '🐕',
      '["Vacunación antirrábica al día","Desparasitación: 12 de septiembre de 2026"]',
      'morita-collar-2026', NULL),
    ('darla', 'Darla', '5 años', 'Beagle', '🐶',
      '["Chequeo general: sin novedades","Alergia leve al polen"]',
      'darla-collar-2026', NULL);

  INSERT OR IGNORE INTO walks (id, pet_id, date, time)
  VALUES
    ('walk-1', 'morita', 'Hoy', '17:30'),
    ('walk-2', 'darla', 'Mañana', '09:00');
`);

function queryAll(sql, parameters = []) {
  const statement = database.prepare(sql);
  statement.bind(parameters);
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows;
}

function toPet(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    breed: row.breed,
    avatar: row.avatar,
    medicalHistory: JSON.parse(row.medical_history),
  };
}

async function persistDatabase() {
  await writeFile(databasePath, Buffer.from(database.export()));
}

app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '4kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/pets', (_request, response) => {
  const pets = queryAll('SELECT * FROM pets WHERE linked_at IS NOT NULL ORDER BY name');
  response.json(pets.map(toPet));
});

app.get('/api/pets/:id', (request, response) => {
  const [pet] = queryAll(
    'SELECT * FROM pets WHERE id = ? AND linked_at IS NOT NULL',
    [request.params.id],
  );
  if (!pet) {
    response.status(404).json({ message: 'No se encontró una mascota vinculada con ese ID.' });
    return;
  }
  response.json(toPet(pet));
});

app.get('/api/walks/upcoming', (_request, response) => {
  const walks = queryAll(`
    SELECT walks.id, pets.name AS petName, walks.date, walks.time
    FROM walks
    INNER JOIN pets ON pets.id = walks.pet_id
    WHERE pets.linked_at IS NOT NULL
    ORDER BY walks.id
  `);
  response.json(walks);
});

app.post('/api/pets/link', async (request, response, next) => {
  const qrPayload = request.body?.qrPayload;
  if (typeof qrPayload !== 'string' || qrPayload.length > 2048) {
    response.status(400).json({ message: 'Envía un código QR válido para vincular la mascota.' });
    return;
  }

  let token;
  try {
    const payloadUrl = new URL(qrPayload);
    if (payloadUrl.protocol !== 'pawssync:' || payloadUrl.hostname !== 'link') {
      response.status(400).json({ message: 'El QR no pertenece a PawsSync.' });
      return;
    }
    token = payloadUrl.searchParams.get('token');
  } catch {
    response.status(400).json({ message: 'El contenido del QR no tiene un formato válido.' });
    return;
  }

  if (!token) {
    response.status(400).json({ message: 'El QR no incluye el token del collar.' });
    return;
  }

  const [row] = queryAll('SELECT * FROM pets WHERE collar_token = ?', [token]);
  if (!row) {
    response.status(404).json({ message: 'El código del collar no está registrado.' });
    return;
  }

  const alreadyLinked = row.linked_at !== null;
  if (!alreadyLinked) {
    database.run('UPDATE pets SET linked_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
    try {
      await persistDatabase();
    } catch (error) {
      database.run('UPDATE pets SET linked_at = NULL WHERE id = ?', [row.id]);
      next(error);
      return;
    }
  }

  response.json({
    pet: toPet({ ...row, linked_at: row.linked_at ?? new Date().toISOString() }),
    linked: true,
    alreadyLinked,
  });
});

app.get('/api/collars/:petId/qr.png', (request, response) => {
  if (!['morita', 'darla'].includes(request.params.petId)) {
    response.status(404).json({ message: 'No existe un QR para ese collar.' });
    return;
  }
  response.sendFile(join(serverDirectory, 'generated', `${request.params.petId}-collar.png`));
});

app.use((error, _request, response, _next) => {
  console.error('Error de API:', error);
  response.status(500).json({ message: 'Error interno al procesar la solicitud.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`PawsSync API disponible en http://localhost:${port}`);
  console.log(`Base SQLite: ${databasePath}`);
});
