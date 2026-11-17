# La Barca de las Grullas · Experiencia WebAR con MindAR

Experiencia web AR optimizada para móvil: el agua aparece **anclada a la escultura real** mediante seguimiento de imagen (MindAR), sin WebXR ni detección de piso. Fluye de forma natural y sin forzar el procesador del teléfono.

## Estructura del proyecto

```
barca_grullas_mindar/
├── index.html              # Estructura HTML
├── css/
│   └── style.css           # Estilos (UI, HUD, panel de calibración)
├── js/
│   └── main.js             # Lógica MindAR + Three.js + shader de agua ligero
├── targets/
│   ├── targets.mind        # ⚠️ DEBES GENERARLO (ver paso 1)
│   └── README.md           # Instrucciones para generar targets.mind
├── assets/
│   └── bosque_noche.mp3    # Audio ambiente (opcional, ver nota)
├── .nojekyll               # Evita que GitHub Pages procese archivos con Jekyll
└── README.md               # Este archivo
```

## Paso 1 · Generar `targets/targets.mind` (obligatorio)

MindAR necesita un archivo binario que describe los puntos de seguimiento de la imagen objetivo. **No está incluido** porque debe generarse a partir de una foto real de la escultura o su placa.

1. Toma una foto clara de **La Barca de las Grullas** (frontal, bien iluminada, sin reflejos) **o** de su placa/etiqueta en el museo.
   - Mejor si la imagen tiene alto contraste, bordes definidos y detalles únicos.
   - Evita vidrios con reflejo, sombras duras y fondos muy repetitivos.
2. Ve al compilador oficial de MindAR:  
   **https://hiukim.github.io/mind-ar-js-doc/tools/compile**
3. Sube la imagen (formato JPG/PNG).
4. Descarga el archivo generado: `targets.mind`
5. Colócalo en la carpeta `targets/` de este proyecto, sobrescribiendo el placeholder.

> Si usas la placa del museo, imprime o muestra la imagen en mate y evita el brillo. Si usas la foto de la escultura, asegúrate de que la escultura ocupe la mayor parte del encuadre.

## Paso 2 · Audio (opcional)

- Si tienes el archivo `bosque_noche.mp3`, colócalo en `assets/`.
- Si no, el código intentará cargarlo desde el repositorio remoto de referencia. Si ambos fallan, la experiencia funciona igual sin audio (el botón de audio simplemente no sonará).

## Paso 3 · Subir a GitHub y desplegar con GitHub Pages

### Opción A · Desde la web de GitHub (sin instalar nada)

1. Ve a **https://github.com** e inicia sesión.
2. Crea un repositorio nuevo: botón **New repository**.
   - Nombre sugerido: `barca-grullas-ar`
   - Déjalo **público** (GitHub Pages gratuito requiere repo público).
   - No marques "Add README" (ya tenemos uno).
3. En la página del repo, haz clic en **Add file → Upload files**.
4. Arrastra **todo el contenido** de la carpeta `barca_grullas_mindar/` (no la carpeta contenedora, sino los archivos dentro: `index.html`, `css/`, `js/`, `targets/`, `assets/`, `.nojekyll`, `README.md`).
   - Asegúrate de que `index.html` quede en la **raíz** del repositorio.
5. Escribe un mensaje de commit (ej. `Primera versión MindAR`) y haz clic en **Commit changes**.
6. Ve a **Settings → Pages** (en el menú lateral del repo).
7. En **Build and deployment → Source**, selecciona **Deploy from a branch**.
8. En **Branch**, elige `main` y carpeta `/ (root)`. Guarda.
9. Espera 1–2 minutos. GitHub mostrará la URL de tu sitio, algo como:  
   `https://TU_USUARIO.github.io/barca-grullas-ar/`
10. Abre esa URL **desde el teléfono** (Chrome en Android, Safari en iOS). GitHub Pages sirve por HTTPS, requisito para acceder a la cámara.

### Opción B · Con Git (terminal)

```bash
# 1. Copia la carpeta del proyecto a tu computadora
# 2. Entra a la carpeta
cd barca_grullas_mindar

# 3. Inicializa git y sube a GitHub
git init
git add .
git commit -m "La Barca de las Grullas AR con MindAR"

# Crea el repo en github.com (botón New repository, sin README)
# Luego conecta y publica:
git branch -M main
git remote add origin https://github.com/TU_USUARIO/barca-grullas-ar.git
git push -u origin main
```

Después activa GitHub Pages como en la Opción A (pasos 6–10).

## Paso 4 · Probar en el museo

1. Abre la URL de GitHub Pages en el teléfono.
2. Toca **"Iniciar experiencia AR"** y permite la cámara.
3. Apunta a la escultura o a la placa usada para generar `targets.mind`.
4. Cuando se detecte, el agua aparecerá anclada. Usa **"⚙ Ajustar"** para:
   - Subir/bajar el agua hasta la base de la barca
   - Ajustar ancho/largo y rotación
   - Cambiar opacidad y velocidad de corriente
   - **Guardar**: el ajuste se recuerda en ese teléfono
5. Usa **"●"** para foto y **"🔇/🔊"** para audio ambiente.

### Consejos para que el seguimiento sea estable

- Buena luz, sin contraluz ni reflejos en vidrio.
- Mantén la imagen objetivo dentro del marco de escaneo.
- Distancia recomendada: 1–3 m.
- Mueve el teléfono lento al inicio; MindAR necesita unos segundos para fijar el ancla.
- Si el agua tiembla, reduce movimientos bruscos y asegúrate de que la foto objetivo sea nítida.

## Optimizaciones aplicadas (para que fluya sin forzar el teléfono)

- **MindAR en vez de WebXR**: no depende del detector de piso que fallaba; el ancla es la imagen.
- **Shader ligero**: 2 muestras de textura de normales, sin ruido fractal costoso (fbm) por píxel.
- **Geometría baja**: plano de agua de 24×16 segmentos.
- **Pixel ratio limitado** a 1.5.
- **Sin partículas masivas**: solo 80 gotas pequeñas en la proa.
- **Suavizado de tracking** (`filterMinCF`, `filterBeta`, `missTolerance`) para evitar temblores.
- **Calibración en el sitio** sin tocar código.

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| "Falta targets/targets.mind" | No generaste o no subiste el archivo | Sigue el Paso 1 y vuelve a subir |
| Pantalla negra / cámara no abre | Permiso denegado o no es HTTPS | Permite cámara en el navegador; usa la URL de GitHub Pages (https) |
| El agua no aparece | La imagen no se detecta | Mejor luz, encuadra la escultura completa, mantén estable 3–5 s |
| El agua queda desalineada | Posición de la foto objetivo | Usa "⚙ Ajustar" y guarda |
| Va lento | Teléfono antiguo o muchas apps abiertas | Cierra apps, baja brillo, usa Chrome/Safari actualizado |

## Créditos

- Museo Leonora Carrington · SLP — *La Barca de las Grullas*
- MindAR (hiukim/mind-ar-js) — seguimiento de imagen en web
- Three.js — renderizado 3D
