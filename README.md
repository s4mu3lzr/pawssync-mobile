# PawsSync Mobile

Aplicación Ionic/Angular con autenticación Supabase, perfiles de mascotas, vinculación QR, clima local y paseos multi-mascota con cronómetro RxJS y ruta GPS.

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. En **Project Settings → API**, copia la URL del proyecto y la clave **publishable** (o la antigua `anon`).
3. Los entornos de desarrollo y producción de este workspace están configurados con la URL y la clave **publishable** del proyecto. Si rotas la clave publishable, actualiza `src/environments/environment.ts` y `src/environments/environment.prod.ts`:

   ```ts
   SUPABASE_URL: 'https://<project-ref>.supabase.co',
   SUPABASE_KEY: 'sb_publishable_...',
   ```

   Para compilar con `--configuration production`, coloca los mismos valores públicos en `src/environments/environment.prod.ts`.
4. En una base nueva, ejecuta `supabase/schema.sql`; si el proyecto ya tenía el esquema anterior, ejecuta `supabase/feature-upgrade.sql` después. La migración añade `birth_date`, `photo_url`, `address`, `contact_phone`, la relación `walk_pets`, políticas de Storage y RPCs seguras. Las notas usan `pet_notes.note_text`; las citas usan `pet_appointments.title`, `appointment_date` y `description`.
5. El proyecto debe permitir **Authentication → Providers → Email** y tener desactivada la confirmación por correo para que el registro devuelva una sesión inmediata. Desde la pantalla de acceso, elige **Regístrate** para crear una cuenta con nombre, correo y contraseña. El nombre no puede contener solo espacios; la contraseña requiere al menos 8 caracteres y un símbolo especial. El nombre se envía como `options.data.full_name` y el trigger `on_auth_user_created` de `supabase/schema.sql` genera automáticamente el perfil asociado. Si Supabase no devuelve una sesión, la app muestra el error y no navega al Dashboard.

### Seguridad de las claves

Una app Angular/Capacitor se ejecuta en el dispositivo: toda URL y clave que consume el cliente se puede extraer del JavaScript o del APK. La URL de Supabase y la clave **publishable/anon** no son secretos; el acceso a filas lo controla RLS. Nunca pongas `service_role`, una secret key, la contraseña de PostgreSQL ni credenciales de administración en Angular. Si un requisito exige que una clave privilegiada no llegue al cliente, las operaciones que la necesitan deben vivir en un backend o Supabase Edge Function.

La aplicación activa persistencia y renovación automática de la sesión de Supabase. Las rutas de pestañas y detalle exigen una sesión autenticada.

## Ejecutar

Desde `pawssync-mobile`:

```bash
npm install
npm start
```

Abre `http://localhost:4200`. Para compilar:

```bash
npm run build
```

## Pruebas automatizadas

Las pruebas unitarias y de componentes usan Vitest, el runner configurado por Angular en este proyecto:

```bash
npm test -- --watch=false
```

Para agregar Cypress a Angular, ejecuta desde la raíz del proyecto:

```bash
ng add @cypress/schematic
```

El esquema instala y configura Cypress. La configuración de este workspace se encuentra en `cypress.config.ts` y el flujo de acceso en `cypress/e2e/login.cy.ts`. Inicia Angular en una terminal y abre Cypress en otra:

```bash
npm start
npx cypress open
```

El test E2E intercepta el endpoint de autenticación para simular una sesión válida y prueba los campos Ionic mediante Shadow DOM; no requiere credenciales reales de Supabase.

Para ejecutar en Android después de configurar Capacitor:

```bash
npm install
npx cap sync android
npx cap open android
```

La app solicita ubicación al consultar el clima y al iniciar un paseo, y cámara al escanear un collar. iOS necesita compilarse en macOS/Xcode; Android solicita los permisos configurados en `AndroidManifest.xml`.

### Widget de Android

El widget PawsSync se registra en `android/app/src/main` y muestra clima, próxima cita médica y el último paseo. `WidgetSyncService` persiste el resumen como JSON bajo la clave `pawssync_widget_data` de Capacitor Preferences; el `AppWidgetProvider` lo lee de `CapacitorStorage` y actualiza el widget al añadirse y con el intervalo del sistema (30 minutos). Después de instalar la app, mantén pulsado el escritorio, abre **Widgets** y agrega **PawsSync Mobile**. Al tocarlo se abre la aplicación.

## Perfil público y QR

Despliega la aplicación web bajo HTTPS y configura el hosting para que las rutas de Angular (en particular `/public/pet/:qr_token`) devuelvan `index.html`. Los collares deben contener enlaces de la forma `https://tu-dominio/public/pet/QR_TOKEN`. El perfil público solo devuelve nombre, fecha de nacimiento, foto, dirección y teléfono para ese token (incluso antes de que el dueño vincule la mascota); esos datos quedan visibles para quien tenga el código. La app autenticada puede escanear el mismo enlace para asignar la mascota al dueño si aún está libre.

Los QR públicos `/pet/TOKEN` sirven para una mascota que ya existe. Para crear mascotas nuevas desde sus placas QR, ejecuta primero `supabase/feature-upgrade.sql` en el SQL Editor de Supabase. La migración crea la RPC segura `register_pet_from_qr` y solicita recargar la caché de esquema de PostgREST. Si ya estaba ejecutada antes de agregar esa RPC, vuelve a ejecutarla.

Para probar la creación de una mascota desde un QR sin necesitar dominio:

```powershell
npm run qr:morita-new
npm run qr:galleta
npm run qr:register -- "Luna" "Mestiza" "2023-06-10"
```

El comando `qr:galleta` genera una ficha de prueba precargada con nombre, raza, nacimiento, dirección y un teléfono ficticio reservado para pruebas; `photo_url` queda vacío. El comando `qr:register` permite generar otras placas; fecha, dirección y teléfono son opcionales. Cada generación produce un token aleatorio de un solo uso que el comando imprime para control de los collares enviados. Escanéalo desde **Vincular** dentro de la app. La pantalla muestra una confirmación; solo al pulsar **Crear y vincular** se inserta la mascota con la sesión autenticada mediante la RPC `register_pet_from_qr`.

Para generar QR públicos de mascotas existentes, configura `PAWSSYNC_PUBLIC_URL` y usa `npm run qr:morita`, `npm run qr:darla` o `npm run qr -- nombre TOKEN_REAL`. La ejecución genera solo el QR; nunca inserta por sí sola. El QR público debe apuntar a un dominio desplegado con HTTPS.

La RPC `get_public_pet_by_qr_token` permite la lectura pública limitada que necesita esa página. No habilita lectura anónima general sobre `pets`.

## Vinculación y registro desde QR

Un QR `https://tu-dominio/pet/TOKEN` vincula una mascota que ya existe; un QR `pawssync://register?...` incluye datos de una mascota nueva y pide confirmación antes de crearla. En ambos casos la operación requiere una sesión autenticada. Un token de registro solo puede utilizarse una vez.

La página web `/qr-generator` permite generar y descargar desde el navegador un QR compatible con el registro móvil. Incluye nombre y raza, y opcionalmente fecha de nacimiento; por privacidad, no incorpora dirección ni teléfono. La página no escribe directamente en la base de datos: el usuario inicia sesión en la app, escanea el código y confirma antes de que `register_pet_from_qr` guarde la mascota. El QR contiene los datos mostrados en la pantalla, así que debe tratarse como información visible para quien lo escanee.

## Paseos

En **Paseo**, elige una o varias mascotas, inicia el cronómetro y permite el acceso a ubicación. La distancia se calcula en vivo con Haversine y se persiste junto a los puntos de ruta. La RPC `save_walk_with_pets` valida que todas las mascotas pertenezcan al usuario y guarda paseo y relaciones `walk_pets` en una operación atómica.

El Dashboard advierte y deja de recomendar el paseo si la temperatura supera los 28 °C o se detecta lluvia. Los datos de seguridad validan teléfonos con números y formatos internacionales comunes tanto en el formulario como al guardar en Supabase; la fecha de nacimiento futura se rechaza. Si se deniega un permiso de GPS o cámara, la app muestra una alerta y permite continuar usando el resto de las funciones.

## Consejos para paseadores

La pestaña **Consejos** ofrece un asistente local con respuestas generales sobre calor, hidratación, frío, patas, correa, ansiedad, premios y convivencia con otros animales. El estado de la conversación se mantiene en memoria con RxJS y cada mensaje incluye su hora; no se guarda información personal ni se envía texto a un proveedor externo. El límite de entrada es de 500 caracteres. El asistente no diagnostica ni reemplaza las instrucciones del dueño o la atención veterinaria.

Esta primera versión no requiere una API de IA ni una clave en el cliente. Si se conecta posteriormente un proveedor de IA, la llamada debe pasar por un backend autenticado, con límites de uso y la clave guardada solo como secreto del servidor.

## Plugins nativos

Geolocation y Camera ya están declarados como dependencias (`@capacitor/geolocation` y `@capacitor/camera`). Tras instalar dependencias, ejecuta `npx cap sync` para propagar los plugins al proyecto nativo.
