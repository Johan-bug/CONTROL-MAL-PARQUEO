# Control Vial Santa Marta — Detección y Criticidad de Mal Parqueo

Aplicación web estática (HTML, CSS y JavaScript puro con Leaflet) desarrollada por estudiantes de Ingeniería de Sistemas de la Universidad del Magdalena para registrar, georreferenciar y priorizar incidencias de mal parqueo e invasión del espacio público en Santa Marta, Colombia.

**Despliegue en GitHub Pages:** https://angelospinososa-del.github.io/CONTROL-MAL-PARQUEO/

---

## Equipo de Trabajo

| Integrante | Rol en el Proyecto | Iniciales (ID Reporte) |
| :--- | :--- | :---: |
| **Angel Sosa Ospino** | Integrador del mapa, instrucciones a la IA e Ingeniero de Lógica y Clasificación | `ASO` |
| **Adrian Jose Marquez Orozco** | Ingeniero de Lógica y Clasificación | `AMO` |
| **Johan David Acosta Peñaloza** | Analista de Campo | `JAP` |
| **Josue David Rodriguez** | Mapa de Calor y Filtros | `JDR` |

---

## Sectores de Estudio Cubiertos

El sistema cuenta con **15 cuadras configuradas** (`datos/vias.json`) y **30 reportes de campo reales** (`datos/reportes.json` + `datos/fotos/`):

1. **Sector Unimagdalena – Villa Marbella – Semáforo de Cañaveral (10 cuadras · 24 reportes):**
   * Carrera 32 (entre Calles 22 y 29) frente al campus de la Universidad del Magdalena.
   * Calles internas de la Urbanización Villa Marbella (Calles 25, 26, 27, 28 y Carrera 31).
   * Intersección semaforizada de Calle 29 / Av. del Ferrocarril (Cañaveral).
2. **Sector Mercado Público de Santa Marta (5 cuadras · 6 reportes):**
   * Carrera 9 entre Calles 11 y 12 (frente a Mundo Fiesta).
   * Calle 11 entre Carreras 8 y 10 (esquina CAI Mercado y Galería Mercado / Granero Alameda).
   * Calle 11 entre Carreras 12 y 13 (sector comercial Calle 11 # 12-42).
   * Calle 12 entre Carreras 9 y 10.

---

## Funcionalidades Principales

* **Captura rápida en campo (< 30 segundos):** Selección de punto en mapa o GPS del dispositivo, asignación automática de la cuadra más cercana, selección de categoría y actor, carga de foto con **herramienta integrada de pixelado irreversible** para ocultar placas y rostros, y guardado offline en `localStorage`.
* **Cálculo automático de criticidad (`criticidad.js`):** Evalúa cada reporte según la fórmula:
  `Puntaje = Peso(Categoría) + Peso(Tipo de Vía) + Peso(Franja Horaria)`
  clasificando el incidente en **Bajo (0–4)**, **Medio (5–6)** o **Alto (7–9)**.
* **Mapa de calor y filtros combinados (`mapa.js`, `filtros.js`):** Visualización con `Leaflet.heat` ponderada por puntaje de criticidad, marcadores individuales por color y filtros dinámicos por cuadra, franja horaria, categoría y actor.
* **Resumen operativo Top 5 (`resumen.js`):** Ranking de las 5 cuadras más críticas ordenado por puntaje acumulado y generación automática de recomendaciones operativas bajo reglas explícitas (`R1` a `R6`).
* **Exportación e importación sin duplicados (`almacenamiento.js`):** Respaldo en JSON (con o sin fotos) o paquete `.zip`, e importación con validación de esquema y control de conflictos por ID.

---

## Estructura del Repositorio

```text
CONTROL-MAL-PARQUEO/
├── index.html                  # Interfaz principal (Captura, Registros y Resumen Top 5)
├── estilos.css                 # Diseño responsivo móvil-primero
├── captura.js                  # Controlador de vistas, GPS, pixelado en canvas y eventos
├── mapa.js                     # Mapas Leaflet, capas de cuadras, marcadores y Leaflet.heat
├── almacenamiento.js           # Gestión de localStorage, validación e importación/exportación
├── criticidad.js               # Cálculo puro del índice de criticidad y franja horaria
├── filtros.js                  # Filtrado multicriterio y estadísticas por categoría
├── resumen.js                  # Agrupación por cuadra, Top 5 y reglas operativas R1-R6
├── pruebas.html                # Suite de pruebas unitarias automatizadas para criticidad.js
├── .nojekyll                   # Evita procesamiento Jekyll en GitHub Pages
├── README.md                   # Documentación general del repositorio
├── datos/
│   ├── criterios.json          # Pesos por categoría, tipo de vía, franja y rangos de nivel
│   ├── vias.json               # Delimitación geográfica y 15 cuadras de Santa Marta
│   ├── reportes.json           # 30 registros de campo verificados
│   └── fotos/                  # Evidencias fotográficas (mp-aso-001.jpg ... mp-aso-030.jpg)
└── documentos/
    ├── anexo-campo.pdf         # Ficha del levantamiento de campo y constancia de anonimización
    ├── arquitectura.pdf        # Diagrama de arquitectura y flujo de datos
    └── bitacora-ingenieria.pdf # Bitácora técnica, pruebas y ajustes ante fallos de IA
```

---

## Ejecución Local y Pruebas

1. Debido a que la aplicación carga los archivos JSON mediante `fetch("datos/...")`, debe abrirse mediante un servidor HTTP local (por ejemplo, la extensión **Live Server** en VS Code) o directamente en **GitHub Pages**.
2. Para verificar las pruebas unitarias del motor de criticidad, abrir `pruebas.html` en el navegador y comprobar que todos los casos estén en estado **PASS**.
