# Arquitectura del Sistema — Control Vial Santa Marta

**Autores:** Angel Sosa Ospino, Adrian Jose Marquez Orozco, Johan David Acosta Peñaloza, Josue David Rodriguez  
**Programa:** Ingeniería de Sistemas — Universidad del Magdalena  

---

## 1. Estilo Arquitectónico

La aplicación adopta una **arquitectura cliente estática modular (Single Page Application ligera sin backend)** desplegada en GitHub Pages. Todo el procesamiento ocurre en el navegador del usuario separando estrictamente la **capa de presentación**, la **capa de persistencia**, la **capa de visualización geoespacial** y los **módulos puros de lógica de negocio** (sin dependencias de DOM ni red, lo que permite ejecutar pruebas unitarias deterministas en `pruebas.html`).

---

## 2. Diagrama de Arquitectura y Flujo de Datos

```text
+-----------------------------------------------------------------------------------+
|                        CAPA DE PRESENTACIÓN (index.html + estilos.css)            |
|  [Vista 1: Captura Rápida]     [Vista 2: Registros y Mapa]    [Vista 3: Resumen]  |
+-------------------+------------------------+------------------------+-------------+
                    |                        |                        |
                    v                        v                        v
+-----------------------------------------------------------------------------------+
|                       CONTROLADOR DE APLICACIÓN (captura.js)                      |
|  - Orquesta eventos UI, GPS, canvas de pixelado y sincronización de estado        |
+--------+--------------------+---------------------+--------------------+----------+
         |                    |                     |                    |
         v                    v                     v                    v
+-----------------+  +------------------+  +------------------+  +------------------+
| almacenamiento  |  |   criticidad.js  |  |    filtros.js    |  |    resumen.js    |
|      .js        |  |   (Módulo Puro)  |  |   (Módulo Puro)  |  |   (Módulo Puro)  |
|                 |  |                  |  |                  |  |                  |
| - localStorage  |  | - horaAMinutos() |  | - filtrarReportes|  | - Top 5 cuadras  |
|   (mp_reportes, |  | - deducirFranja()|  | - Estadísticas   |  | - Reglas R1-R6   |
|    mp_config)   |  | - calcularCriti- |  |   por categoría  |  |   operativas     |
| - Exportar/     |  |   cidad()        |  |                  |  |                  |
|   Importar JSON |  +--------+---------+  +------------------+  +------------------+
| - Control cuota |           ^
+--------+--------+           |
         |                    |
         v                    |
+-----------------+  +--------+-----------------------------------------------------+
|    mapa.js      |  |              CAPA DE DATOS ESTÁTICOS (datos/)                |
|                 |  |  - vias.json      (15 cuadras y límites de Santa Marta)      |
| - Leaflet 1.9.4 |  |  - criterios.json (Pesos categoría/vía/franja y niveles)     |
| - Leaflet.heat  |  |  - reportes.json  (30 evidencias precargadas)                |
| - Nominatim OSM |  |  - fotos/*.jpg    (30 imágenes anonimizadas)                 |
+-----------------+  +--------------------------------------------------------------+
```

---

## 3. Descripción de Módulos

1. **`index.html` y `estilos.css`:** Estructura semántica con tres vistas conmutables mediante pestañas inferiores y diseño adaptable a pantallas móviles en campo.
2. **`captura.js`:** Gestiona el ciclo de vida de la app, obtiene coordenadas mediante Geolocation API o clic en mapa, calcula la distancia geométrica punto-segmento para asignar la cuadra más cercana y controla el `<canvas>` de pixelado irreversible.
3. **`criticidad.js` (Lógica pura):** Deduce si la hora local cae en rango pico (`06:30–08:30`, `11:30–14:00`, `17:00–19:30`) y suma los pesos definidos en `datos/criterios.json`.
4. **`mapa.js`:** Administra los dos mapas Leaflet (captura y registros), dibuja las polilíneas de las 15 cuadras, genera la capa de calor `L.heatLayer` ponderada por `puntaje / 9` y permite alternar entre *Ambos*, *Solo calor* y *Solo puntos*.
5. **`filtros.js` y `resumen.js` (Lógica pura):** Filtran el arreglo unificado de reportes (precargados + locales) y calculan el ranking Top 5 con recomendaciones operativas deterministas (`R1` a `R6`).
6. **`almacenamiento.js`:** Administra `localStorage`, captura `QuotaExceededError` sin pérdida de datos y valida estructura, límites geográficos y duplicados al importar archivos JSON externos.
