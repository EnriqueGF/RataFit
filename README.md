# RataFit

PWA de registro de entrenamiento, pensada para una rutina **fullbody de 2 a 5
días** con **pecho y espalda como prioridades**. Funciona offline, se instala en
el móvil y guarda todo en el propio dispositivo.

**▶ [enriquegf.github.io/RataFit](https://enriquegf.github.io/RataFit/)**

Para instalarla en el móvil: abre ese enlace en Chrome o Safari y elige "Añadir
a la pantalla de inicio". A partir de ahí funciona como una app nativa, también
sin conexión.

## Arrancar

```bash
npm install
npm run dev        # desarrollo
npm run build      # producción (dist/)
npm run preview    # servir el build
npm test           # 315 tests de la PWA
npm --prefix server test   # 27 tests del servidor
npm run coverage   # informe de cobertura
```

## Cuenta y sincronización

Por defecto **no hace falta cuenta**: los entrenamientos se guardan en el propio
dispositivo y la app funciona sin conexión. Si quieres tenerlos en el móvil y en
el ordenador a la vez, en **AJUSTES → Mi cuenta** puedes crear una con usuario y
contraseña. Al registrarte, **lo que ya tengas guardado en ese dispositivo se
sube automáticamente** a la cuenta nueva.

Cómo funciona la sincronización:

- Los datos siguen viviendo en el dispositivo; el servidor guarda una copia. Si
  te quedas sin cobertura en el gimnasio, sigues registrando series y se suben
  al recuperar la conexión.
- La subida es automática y agrupada (2,5 s tras el último cambio), para no
  llamar al servidor en cada serie.
- Si dos dispositivos tocan los mismos datos, **gana el que guardó más
  recientemente** y el otro se actualiza, en vez de perder entrenamientos.
- Al **entrar** en una cuenta existente, sus datos sustituyen a los locales. La
  app te avisa antes.

Levantar tu propio servidor:

```bash
cp .env.example .env
# Genera un secreto propio y pégalo en JWT_SECRET:
openssl rand -base64 48
docker compose up -d
```

Queda en `http://localhost`. Con un dominio, pon `RATAFIT_DOMAIN=ratafit.tudominio.com`
en el `.env` y Caddy consigue el certificado **HTTPS automáticamente**; sin él, la
contraseña viajaría sin cifrar, así que para uso fuera de tu red conviene tener
dominio.

| Servicio | Qué hace |
|---|---|
| `api` | Node + SQLite. Cuentas y copia del estado. Datos en el volumen `ratafit-data` |
| `web` | La PWA compilada, servida por nginx |
| `caddy` | Entrada única: sirve la web y redirige `/api` a la API, con HTTPS |

La copia de seguridad del servidor es un solo fichero:

```bash
docker compose cp api:/data/ratafit.db ./copia-ratafit.db
```

## Cuestionario inicial

La primera vez, la app pregunta antes de proponer nada:

1. **Material** — qué hay en tu gimnasio (barra, mancuernas, máquinas, poleas, multipower, peso corporal). Solo se proponen ejercicios que puedas hacer, y avisa si algún grupo se queda sin cubrir.
2. **Ejercicios** — ★ los que quieres sí o sí y ✕ los que no puedes o no quieres hacer (no hay máquina, te molesta, no te gusta). El resto lo elige la app.
3. **Objetivo** — grupos prioritarios (pecho y espalda por defecto) y experiencia. Un principiante recibe series rectas y RIR conservador; un avanzado, más volumen y barra libre.
4. **Calendario** — 2, 3, 4 o 5 días, qué días de la semana (o ninguno, para entrenar cuando quieras) y cuánto dura la sesión.
5. **Resumen** — la rutina generada, ejercicio a ejercicio, antes de aceptarla.

Con eso se genera la rutina: cada día abre con un básico pesado, pecho y espalda salen en todas las sesiones, y las series se reparten para que el volumen **semanal** de cada grupo caiga dentro del rango recomendado sea cual sea el número de días.

Se puede rehacer cuando quieras desde **AJUSTES → Mi gimnasio** (el histórico y los récords se conservan), o saltarlo y usar la plantilla por defecto.

## Pantallas

| Pestaña | Qué hace |
|---|---|
| **HOY** | Fase del mesociclo, elección del día a entrenar y volumen semanal planificado |
| **ENTRENO** | Cronómetro con play/pausa, registro de series, GIFs, descanso, cambio de ejercicios |
| **RUTINA** | Edición completa: días, día de la semana, ejercicios, series, reps, RIR, técnica, descanso |
| **PROGRESO** | Peso y grasa opcional con gráficas, acumulado, volumen de 7 días, récords, aviso de estancamiento e historial |
| **AJUSTES** | Unidades, avisos, mesociclo, rehacer el cuestionario, exportar/importar copia y borrado |

## La rutina por defecto

Si saltas el cuestionario, se usa esta plantilla de tres días (lunes, miércoles
y viernes por defecto, cambiables o "libres"):

- **DÍA A · Empuje pesado** — press banca, remo con barra, sentadilla, press inclinado, jalón, superserie de laterales + tríceps, core, gemelos
- **DÍA B · Tracción pesada** — dominadas, press inclinado con barra, peso muerto rumano, remo con apoyo, hip thrust, contractora, press de hombro, superserie bíceps + tríceps, gemelos
- **DÍA C · Volumen y densidad** — press con mancuernas, remo en polea, hack squat, extensiones, cruces, pullover, curl femoral, superserie face pull + martillo, core

Pecho y espalda aparecen los tres días (uno pesado + accesorios). El volumen
semanal planificado queda dentro del rango recomendado para todos los grupos,
con pecho (21 series) y espalda (21,5) en la parte alta.

## Cómo calcula

- **1RM estimado**: Epley ajustado por RIR, de modo que 8 reps a RIR 2 equivalen a 10 al fallo.
- **Progresión**: doble progresión. Primero se llena el rango de repeticiones en todas las series y solo entonces sube el peso; si sobró RIR, sube el doble.
- **Autorregulación**: si acabas muy por debajo del RIR objetivo sin llegar al rango, la carga baja un 10 % en vez de insistir.
- **Periodización**: mesociclo de 5 semanas (configurable) — acumulación → intensificación → pico → descarga. Cada fase ajusta el RIR objetivo y el número de series.
- **Series efectivas**: las aproximaciones no cuentan; por encima de RIR 4 una serie vale la mitad; las técnicas de intensificación suman estímulo extra.
- **Técnicas avanzadas** (myo-reps, drop set, rest-pause, cluster, parciales en estiramiento, top set + back-off, superseries): se aplican solo a la última serie de los accesorios. Los básicos pesados van a series rectas por su ratio estímulo/fatiga, y en descarga se desactivan todas.
- **Aproximaciones**: se generan solas para los compuestos (3 rampas si el coste es alto, 2 si no), escaladas al peso de trabajo.
- **Estancamiento**: tres sesiones seguidas sin mejorar el 1RM estimado disparan un aviso con opciones.

## Datos

En **PROGRESO → Evolución corporal** puedes guardar tu peso por fecha y, si quieres,
el porcentaje de grasa. Las gráficas muestran su evolución; el historial permite
editar o eliminar mediciones. El peso respeta la unidad elegida en Ajustes y se
guarda internamente en kg. Guardar una fecha existente actualiza esa medición.
Las mediciones se incluyen en las copias de seguridad y en la sincronización.
Las copias y cuentas anteriores siguen funcionando y conservan sus datos; el
nuevo historial comienza vacío, sin inventar fechas para el peso de Ajustes.

Todo vive en `localStorage` (clave `iron-terminal:v1`) y se guarda tras cada
cambio, así que una sesión a medias sobrevive a que el móvil cierre la app. Con
una cuenta creada, además se copia al servidor.

Cada ejercicio muestra dos fotogramas (inicio y final del recorrido) que la app
alterna para enseñar el movimiento. Vienen de
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio
público) y el service worker los cachea, así que tras verlos una vez quedan
disponibles sin conexión.

Conviene exportar una copia desde AJUSTES antes de cambiar de móvil o limpiar el
navegador.

## Estructura

```
src/
  domain/      tipos, motor de entrenamiento, cuestionario y generador de rutinas (sin React)
  data/        biblioteca de 54 ejercicios con imágenes, consignas y alternativas
  state/       reducer, persistencia y contexto
  hooks/       cronómetro de sesión y de descanso
  components/  pantallas y componentes de UI
  api/         cliente HTTP del servidor
server/
  src/         API de cuentas y sincronización (Express + SQLite)
```

La lógica de entrenamiento está aislada de React en `src/domain`, lo que permite
probarla directamente.
