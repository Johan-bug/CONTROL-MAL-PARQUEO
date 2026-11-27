/* ============================================================================
 * ARCHIVO: mapa.js
 * RESPONSABILIDAD: Gestión de los mapas Leaflet (mapa de captura y mapa de
 * registros con capa de calor Leaflet.heat ponderada por criticidad y capa
 * de puntos individuales), dibujo de cuadras y marcador arrastrable.
 * ============================================================================ */

var mapaCaptura = null;
var marcadorCaptura = null;
var capaCuadrasCaptura = null;
var capaReportesCaptura = null;
var polilineasCuadras = {};
var capaCuadrasRegistros = null;
var trazadosCuadrasOSM = {};
var estadoCargaTrazadosOSM = "pendiente";

var mapaRegistros = null;
var capaMarcadoresRegistros = null;
var capaCalorRegistros = null;
var modoVisualizacionRegistros = "ambos"; // "ambos" | "calor" | "puntos"
var ultimosReportesRegistros = [];
var ultimoViasRegistros = null;

/**
 * Devuelve true si la librería Leaflet (L) está cargada en el navegador.
 */
function leafletDisponible() {
  return typeof L !== "undefined" && L !== null;
}

/**
 * Devuelve true si el plugin Leaflet.heat (L.heatLayer) está disponible.
 */
function heatDisponible() {
  return leafletDisponible() && typeof L.heatLayer === "function";
}

/**
 * Devuelve el color hexadecimal asociado a cada nivel de criticidad.
 */
function obtenerColorNivel(nivel) {
  var clave = String(nivel || "").toLowerCase();
  if (clave === "alto") return "#dc2626";   // Rojo
  if (clave === "medio") return "#d97706";  // Ámbar / Naranja
  return "#16a34a";                         // Verde (Bajo)
}


/**
 * Obtiene geometrías reales de calles desde OpenStreetMap (Overpass).
 * Nunca utiliza los extremos como sustituto visual: si no hay coincidencia
 * suficientemente cercana, la cuadra queda sin dibujar.
 */
function distanciaPuntoSegmentoOSM(p, a, b) {
  var lat0 = p[0] * Math.PI / 180;
  var escalaX = 111320 * Math.cos(lat0);
  var escalaY = 111320;
  var ax = (a[1] - p[1]) * escalaX;
  var ay = (a[0] - p[0]) * escalaY;
  var bx = (b[1] - p[1]) * escalaX;
  var by = (b[0] - p[0]) * escalaY;
  var dx = bx - ax;
  var dy = by - ay;
  var denom = dx * dx + dy * dy;
  var t = denom ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom)) : 0;
  var x = ax + t * dx;
  var y = ay + t * dy;
  return {
    distancia: Math.sqrt(x * x + y * y),
    t: t,
    punto: [p[0] + y / escalaY, p[1] + x / escalaX]
  };
}

function puntoMasCercanoEnViaOSM(p, geometria) {
  var mejor = null;
  for (var i = 0; i < geometria.length - 1; i++) {
    var candidato = distanciaPuntoSegmentoOSM(p, geometria[i], geometria[i + 1]);
    if (!mejor || candidato.distancia < mejor.distancia) {
      mejor = {
        distancia: candidato.distancia,
        orden: i + candidato.t,
        indice: i,
        punto: candidato.punto
      };
    }
  }
  return mejor;
}

function recortarViaOSM(geometria, inicio, fin) {
  var a = inicio;
  var b = fin;
  if (a.orden > b.orden) {
    a = fin;
    b = inicio;
  }
  var puntos = [a.punto];
  for (var i = a.indice + 1; i <= b.indice; i++) {
    if (i >= 0 && i < geometria.length) puntos.push([geometria[i][0], geometria[i][1]]);
  }
  puntos.push(b.punto);
  if (inicio.orden > fin.orden) puntos.reverse();
  return puntos;
}

function resolverGeometriaCuadraOSM(cuadra, viasOSM) {
  if (!cuadra || !Array.isArray(cuadra.extremos) || cuadra.extremos.length < 2) return null;
  var mejor = null;
  for (var i = 0; i < viasOSM.length; i++) {
    var via = viasOSM[i];
    if (!Array.isArray(via.geometry) || via.geometry.length < 2) continue;
    var p1 = puntoMasCercanoEnViaOSM(cuadra.extremos[0], via.geometry);
    var p2 = puntoMasCercanoEnViaOSM(cuadra.extremos[1], via.geometry);
    if (!p1 || !p2) continue;
    var puntuacion = p1.distancia + p2.distancia;
    if (!mejor || puntuacion < mejor.puntuacion) {
      mejor = { via: via, p1: p1, p2: p2, puntuacion: puntuacion };
    }
  }
  if (!mejor || mejor.p1.distancia > 45 || mejor.p2.distancia > 45) return null;
  var trazado = recortarViaOSM(mejor.via.geometry, mejor.p1, mejor.p2);
  if (trazado.length < 2) return null;
  var longitud = 0;
  for (var k = 1; k < trazado.length; k++) {
    var dLat = (trazado[k][0] - trazado[k - 1][0]) * 111320;
    var dLng = (trazado[k][1] - trazado[k - 1][1]) * 111320 * Math.cos(trazado[k][0] * Math.PI / 180);
    longitud += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  var dExtLat = (cuadra.extremos[1][0] - cuadra.extremos[0][0]) * 111320;
  var dExtLng = (cuadra.extremos[1][1] - cuadra.extremos[0][1]) * 111320 * Math.cos(cuadra.extremos[0][0] * Math.PI / 180);
  var distanciaExtremos = Math.sqrt(dExtLat * dExtLat + dExtLng * dExtLng);
  if (longitud > 350 || longitud > distanciaExtremos * 2.5 + 30) return null;
  return trazado;
}

function consultarOverpassOSM(cuadras, intento) {
  intento = intento || 0;
  var puntos = [];
  for (var i = 0; i < cuadras.length; i++) {
    if (cuadras[i].extremos) {
      puntos.push(cuadras[i].extremos[0], cuadras[i].extremos[1]);
    }
  }
  if (!puntos.length) return Promise.resolve([]);
  var sur = Math.min.apply(null, puntos.map(function (p) { return p[0]; })) - 0.002;
  var norte = Math.max.apply(null, puntos.map(function (p) { return p[0]; })) + 0.002;
  var oeste = Math.min.apply(null, puntos.map(function (p) { return p[1]; })) - 0.002;
  var este = Math.max.apply(null, puntos.map(function (p) { return p[1]; })) + 0.002;
  var bbox = sur + "," + oeste + "," + norte + "," + este;
  var consulta = '[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"](' + bbox + ');out geom;';
  var servidores = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  return fetch(servidores[intento], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: "data=" + encodeURIComponent(consulta)
  }).then(function (respuesta) {
    if (!respuesta.ok) throw new Error("Overpass no disponible");
    return respuesta.json();
  }).then(function (datos) {
    return Array.isArray(datos.elements) ? datos.elements : [];
  }).catch(function (error) {
    if (intento + 1 < servidores.length) return consultarOverpassOSM(cuadras, intento + 1);
    throw error;
  });
}

function cargarTrazadosCuadrasOSM(vias) {
  var cuadras = vias && Array.isArray(vias.cuadras) ? vias.cuadras : [];
  var grupos = [[], []];
  for (var i = 0; i < cuadras.length; i++) {
    var c = cuadras[i];
    var latMedia = (c.extremos[0][0] + c.extremos[1][0]) / 2;
    grupos[latMedia > 11.23 ? 1 : 0].push(c);
  }
  var consultas = grupos.filter(function (g) { return g.length > 0; }).map(function (g) {
    return consultarOverpassOSM(g).then(function (elementos) {
      return { cuadras: g, vias: elementos };
    });
  });
  return Promise.all(consultas).then(function (resultados) {
    var resueltas = {};
    for (var g = 0; g < resultados.length; g++) {
      var bloque = resultados[g];
      for (var j = 0; j < bloque.cuadras.length; j++) {
        var cuadra = bloque.cuadras[j];
        var trazado = resolverGeometriaCuadraOSM(cuadra, bloque.vias);
        if (trazado) resueltas[cuadra.id] = trazado;
      }
    }
    trazadosCuadrasOSM = resueltas;
    estadoCargaTrazadosOSM = "completo";
    return resueltas;
  }).catch(function () {
    trazadosCuadrasOSM = {};
    estadoCargaTrazadosOSM = "error";
    return {};
  });
}

function dibujarCuadrasCaptura(vias, alElegirUbicacion) {
  if (!capaCuadrasCaptura) return;
  capaCuadrasCaptura.clearLayers();
  polilineasCuadras = {};
  if (!vias || !Array.isArray(vias.cuadras)) return;
  for (var i = 0; i < vias.cuadras.length; i++) {
    var cuadra = vias.cuadras[i];
    var trazado = trazadosCuadrasOSM[cuadra.id];
    if (!trazado) continue;
    var linea = L.polyline(trazado, { color: "#475569", weight: 5, opacity: 0.7 });
    linea.bindTooltip(cuadra.nombre + " (" + cuadra.tipo_via + ")", { sticky: true });
    linea.on("click", function (e) {
      if (typeof alElegirUbicacion === "function") alElegirUbicacion(e.latlng.lat, e.latlng.lng);
    });
    linea.addTo(capaCuadrasCaptura);
    polilineasCuadras[cuadra.id] = linea;
  }
}

function dibujarCuadrasConEvidenciaRegistros(listaReportes, vias) {
  if (!capaCuadrasRegistros || !vias || !Array.isArray(vias.cuadras)) return;
  capaCuadrasRegistros.clearLayers();
  var resumen = {};
  for (var i = 0; i < listaReportes.length; i++) {
    var r = listaReportes[i];
    if (!r || !r.cuadra) continue;
    if (!resumen[r.cuadra]) resumen[r.cuadra] = { total: 0, altos: 0, medios: 0, bajos: 0, ids: [] };
    var item = resumen[r.cuadra];
    item.total++;
    item.ids.push(r.id);
    var nivel = String(r.criticidad && r.criticidad.nivel || "bajo").toLowerCase();
    if (nivel === "alto") item.altos++;
    else if (nivel === "medio") item.medios++;
    else item.bajos++;
  }
  for (var j = 0; j < vias.cuadras.length; j++) {
    var cuadra = vias.cuadras[j];
    var datos = resumen[cuadra.id];
    var trazado = trazadosCuadrasOSM[cuadra.id];
    if (!datos || !trazado) continue;
    var color = datos.altos ? "#dc2626" : (datos.medios ? "#d97706" : "#16a34a");
    L.polyline(trazado, { color: color, weight: 7, opacity: 0.9 })
      .bindPopup("<strong>" + cuadra.nombre + "</strong><br>" +
        "Evidencias: " + datos.total + "<br>" +
        "Criticidad alta: " + datos.altos + " · media: " + datos.medios + " · baja: " + datos.bajos +
        "<br><small>" + datos.ids.join(", ") + "</small>")
      .addTo(capaCuadrasRegistros);
  }
}

/**
 * Inicializa el mapa de la vista Captura con OpenStreetMap y las cuadras de vias.json.
 */
function iniciarMapaCaptura(idContenedor, vias, alElegirUbicacion) {
  if (!leafletDisponible()) {
    return false;
  }

  var centro = (vias && vias.zona && vias.zona.centro) ? vias.zona.centro : [11.2450, -74.2064];
  var zoom = (vias && vias.zona && vias.zona.zoom) ? vias.zona.zoom : 17;

  mapaCaptura = L.map(idContenedor, {
    zoomControl: true
  }).setView(centro, zoom);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapaCaptura);

  capaCuadrasCaptura = L.layerGroup().addTo(mapaCaptura);
  capaReportesCaptura = L.layerGroup().addTo(mapaCaptura);
  polilineasCuadras = {};

  // Las cuadras solo se dibujan cuando se obtuvo su geometría vial real de OSM.
  dibujarCuadrasCaptura(vias, alElegirUbicacion);
  cargarTrazadosCuadrasOSM(vias).then(function () {
    dibujarCuadrasCaptura(vias, alElegirUbicacion);
    dibujarCuadrasConEvidenciaRegistros(ultimosReportesRegistros, ultimoViasRegistros);
  });

  mapaCaptura.on("click", function (e) {
    if (typeof alElegirUbicacion === "function") {
      alElegirUbicacion(e.latlng.lat, e.latlng.lng);
    }
  });

  return true;
}

/**
 * Crea o mueve el marcador arrastrable de ubicación en el mapa de captura.
 */
function actualizarMarcadorCaptura(lat, lng, alArrastrar) {
  if (!leafletDisponible() || !mapaCaptura) return;

  var posicion = [lat, lng];

  if (!marcadorCaptura) {
    marcadorCaptura = L.marker(posicion, {
      draggable: true,
      title: "Arrastra para ajustar la ubicación exacta"
    }).addTo(mapaCaptura);

    marcadorCaptura.on("dragend", function () {
      var pos = marcadorCaptura.getLatLng();
      if (typeof alArrastrar === "function") {
        alArrastrar(pos.lat, pos.lng);
      }
    });
  } else {
    marcadorCaptura.setLatLng(posicion);
  }

  mapaCaptura.panTo(posicion);
}

/**
 * Resalta visualmente la cuadra asignada en el mapa de captura y atenúa las demás.
 */
function resaltarCuadraCaptura(cuadraId) {
  if (!leafletDisponible() || !mapaCaptura) return;

  var ids = Object.keys(polilineasCuadras);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var linea = polilineasCuadras[id];
    if (id === cuadraId) {
      linea.setStyle({
        color: "#0284c7",
        weight: 9,
        opacity: 1
      });
      linea.bringToFront();
    } else {
      linea.setStyle({
        color: "#64748b",
        weight: 5,
        opacity: 0.55
      });
    }
  }
}

/**
 * Dibuja puntos pequeños de referencia de los reportes ya guardados en el mapa de captura.
 */
function actualizarPuntosEnMapaCaptura(listaReportes) {
  if (!leafletDisponible() || !mapaCaptura || !capaReportesCaptura) return;

  capaReportesCaptura.clearLayers();

  for (var i = 0; i < listaReportes.length; i++) {
    var r = listaReportes[i];
    var nivel = r.criticidad ? r.criticidad.nivel : "Bajo";
    var color = obtenerColorNivel(nivel);

    L.circleMarker([r.lat, r.lng], {
      radius: 6,
      fillColor: color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85
    })
      .bindPopup(
        "<strong>" + r.id + "</strong><br>" +
        "Cuadra: " + r.cuadra + "<br>" +
        "Nivel: " + nivel + " (" + (r.criticidad ? r.criticidad.puntaje : "-") + ")"
      )
      .addTo(capaReportesCaptura);
  }
}

/**
 * Recalcula el tamaño del mapa de captura cuando su contenedor pasa de oculto a visible.
 */
function redimensionarMapaCaptura() {
  if (leafletDisponible() && mapaCaptura) {
    setTimeout(function () {
      mapaCaptura.invalidateSize();
    }, 60);
  }
}

/**
 * Inicializa el mapa de la vista Registros con soporte para capa de calor
 * (Leaflet.heat) y capa de puntos individuales coloreados por criticidad.
 */
function iniciarMapaRegistros(idContenedor, vias) {
  if (!leafletDisponible()) {
    return false;
  }

  ultimoViasRegistros = vias;
  var centro = (vias && vias.zona && vias.zona.centro) ? vias.zona.centro : [11.2450, -74.2064];
  var zoom = (vias && vias.zona && vias.zona.zoom) ? vias.zona.zoom : 17;

  mapaRegistros = L.map(idContenedor, {
    zoomControl: true
  }).setView(centro, zoom);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapaRegistros);

  capaCuadrasRegistros = L.layerGroup().addTo(mapaRegistros);
  capaMarcadoresRegistros = L.layerGroup().addTo(mapaRegistros);

  // Avisar si Leaflet.heat no cargó
  var avisoCalor = document.getElementById("aviso-sin-calor");
  if (avisoCalor && !heatDisponible()) {
    avisoCalor.hidden = false;
  }

  // Agregar leyenda de colores por nivel de criticidad
  var leyenda = L.control({ position: "bottomright" });
  leyenda.onAdd = function () {
    var div = L.DomUtil.create("div", "leyenda-mapa");
    div.innerHTML =
      "<strong>Criticidad / Calor</strong>" +
      '<div><span class="punto-leyenda" style="background:#dc2626"></span> Alto (7–9)</div>' +
      '<div><span class="punto-leyenda" style="background:#d97706"></span> Medio (5–6)</div>' +
      '<div><span class="punto-leyenda" style="background:#16a34a"></span> Bajo (0–4)</div>';
    return div;
  };
  leyenda.addTo(mapaRegistros);

  return true;
}

/**
 * Aplica la visibilidad de las capas del mapa de registros según el modo elegido:
 * "ambos" (mapa de calor + puntos), "calor" (solo mapa de calor) o "puntos" (solo marcadores).
 */
function aplicarModoCapasRegistros() {
  if (!leafletDisponible() || !mapaRegistros) return;

  var mostrarCalor = modoVisualizacionRegistros === "ambos" || modoVisualizacionRegistros === "calor";
  var mostrarPuntos = modoVisualizacionRegistros === "ambos" || modoVisualizacionRegistros === "puntos";

  if (capaCalorRegistros) {
    if (mostrarCalor) {
      if (!mapaRegistros.hasLayer(capaCalorRegistros)) {
        capaCalorRegistros.addTo(mapaRegistros);
      }
    } else if (mapaRegistros.hasLayer(capaCalorRegistros)) {
      mapaRegistros.removeLayer(capaCalorRegistros);
    }
  }

  if (capaMarcadoresRegistros) {
    if (mostrarPuntos) {
      if (!mapaRegistros.hasLayer(capaMarcadoresRegistros)) {
        capaMarcadoresRegistros.addTo(mapaRegistros);
      }
    } else if (mapaRegistros.hasLayer(capaMarcadoresRegistros)) {
      mapaRegistros.removeLayer(capaMarcadoresRegistros);
    }
  }
}

/**
 * Cambia el modo de visualización del mapa de registros y actualiza las capas al instante.
 */
function cambiarModoMapaRegistros(nuevoModo) {
  if (nuevoModo !== "ambos" && nuevoModo !== "calor" && nuevoModo !== "puntos") {
    return;
  }
  modoVisualizacionRegistros = nuevoModo;
  aplicarModoCapasRegistros();
}

/**
 * Actualiza tanto la capa de calor (Leaflet.heat ponderada por criticidad.puntaje)
 * como los marcadores individuales en el mapa de Registros.
 */
function actualizarMarcadoresRegistros(listaReportes, vias) {
  ultimosReportesRegistros = Array.isArray(listaReportes) ? listaReportes : [];
  if (vias) ultimoViasRegistros = vias;

  if (!leafletDisponible() || !mapaRegistros || !capaMarcadoresRegistros) return;

  capaMarcadoresRegistros.clearLayers();
  dibujarCuadrasConEvidenciaRegistros(ultimosReportesRegistros, ultimoViasRegistros);

  if (capaCalorRegistros && mapaRegistros.hasLayer(capaCalorRegistros)) {
    mapaRegistros.removeLayer(capaCalorRegistros);
  }
  capaCalorRegistros = null;

  var coordenadas = [];
  var puntosCalor = [];

  for (var i = 0; i < ultimosReportesRegistros.length; i++) {
    var r = ultimosReportesRegistros[i];
    if (typeof r.lat !== "number" || typeof r.lng !== "number") continue;

    var nivel = r.criticidad ? r.criticidad.nivel : "Bajo";
    var puntaje = r.criticidad && typeof r.criticidad.puntaje === "number" ? r.criticidad.puntaje : 1;
    var color = obtenerColorNivel(nivel);

    // Intensidad ponderada por el puntaje de criticidad (escala 0..9 -> 0.25..1.0)
    var intensidad = Math.max(0.25, Math.min(1.0, puntaje / 9));
    puntosCalor.push([r.lat, r.lng, intensidad]);

    var marcador = L.circleMarker([r.lat, r.lng], {
      radius: 7,
      fillColor: color,
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    });

    marcador.bindPopup(
      "<strong>" + r.id + "</strong> (" + r.origen + ")<br>" +
      "Fecha: " + r.fecha_hora.replace("T", " ") + "<br>" +
      "Cuadra: " + r.cuadra + "<br>" +
      "Nivel: <strong>" + nivel + " (" + puntaje + " pts)</strong>"
    );

    marcador.addTo(capaMarcadoresRegistros);
    coordenadas.push([r.lat, r.lng]);
  }

  // Crear capa de calor solo si el contenedor ya tiene tamaño visible (> 0 px)
  var tamMapa = mapaRegistros.getSize();
  if (heatDisponible() && puntosCalor.length > 0 && tamMapa.x > 0 && tamMapa.y > 0) {
    capaCalorRegistros = L.heatLayer(puntosCalor, {
      radius: 28,
      blur: 20,
      maxZoom: 18,
      max: 1.0,
      minOpacity: 0.45,
      gradient: {
        0.30: "#16a34a",
        0.65: "#f59e0b",
        1.00: "#dc2626"
      }
    });
  }

  aplicarModoCapasRegistros();

  if (coordenadas.length > 0) {
    var limites = L.latLngBounds(coordenadas);
    mapaRegistros.fitBounds(limites, { padding: [26, 26], maxZoom: 17 });
  } else if (ultimoViasRegistros && ultimoViasRegistros.zona && ultimoViasRegistros.zona.centro) {
    mapaRegistros.setView(ultimoViasRegistros.zona.centro, ultimoViasRegistros.zona.zoom || 17);
  }
}

/**
 * Recalcula el tamaño del mapa de registros cuando se abre la pestaña Registros
 * y reconstruye la capa de calor para evitar el lienzo 0x0 al estar oculto.
 */
function redimensionarMapaRegistros() {
  if (leafletDisponible() && mapaRegistros) {
    setTimeout(function () {
      mapaRegistros.invalidateSize();
      actualizarMarcadoresRegistros(ultimosReportesRegistros, ultimoViasRegistros);
    }, 80);
  }
}

/**
 * Busca coincidencias en las cuadras de vias.json y en Nominatim (OpenStreetMap)
 * priorizando Santa Marta / zona de estudio.
 * Devuelve Promise<Array<{ titulo, subtitulo, lat, lng, origen }>>.
 */
function buscarDireccionesMapa(textoConsulta, vias) {
  var q = String(textoConsulta || "").trim();
  if (q.length < 2) {
    return Promise.resolve([]);
  }

  var qLower = q.toLowerCase();
  var resultados = [];

  // 1. Coincidencias locales en cuadras de vias.json
  if (vias && Array.isArray(vias.cuadras)) {
    for (var i = 0; i < vias.cuadras.length; i++) {
      var c = vias.cuadras[i];
      if (!Array.isArray(c.extremos) || c.extremos.length === 0) continue;

      var textoCuadra = (String(c.nombre || "") + " " + String(c.id || "") + " " + String(c.tipo_via || "")).toLowerCase();
      if (textoCuadra.indexOf(qLower) !== -1) {
        var sumaLat = 0;
        var sumaLng = 0;
        for (var j = 0; j < c.extremos.length; j++) {
          sumaLat += Number(c.extremos[j][0]);
          sumaLng += Number(c.extremos[j][1]);
        }
        resultados.push({
          titulo: c.nombre + " (" + c.id + ")",
          subtitulo: "Cuadra en zona · " + (c.tipo_via === "arterial" ? "Vía arterial" : "Vía secundaria"),
          lat: Number((sumaLat / c.extremos.length).toFixed(6)),
          lng: Number((sumaLng / c.extremos.length).toFixed(6)),
          origen: "local"
        });
      }
    }
  }

  // 2. Consulta a Nominatim (con viewbox si existe zona.limites)
  var consultaConCiudad = qLower.indexOf("santa marta") === -1 ? q + ", Santa Marta, Colombia" : q;
  var url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=co&q=" +
    encodeURIComponent(consultaConCiudad);

  var lim = vias && vias.zona && vias.zona.limites;
  if (
    lim &&
    typeof lim.lng_min === "number" &&
    typeof lim.lat_min === "number" &&
    typeof lim.lng_max === "number" &&
    typeof lim.lat_max === "number"
  ) {
    // Formato viewbox de Nominatim: lon_min,lat_max,lon_max,lat_min
    url += "&viewbox=" + lim.lng_min + "," + lim.lat_max + "," + lim.lng_max + "," + lim.lat_min;
  }

  return fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  })
    .then(function (resp) {
      if (!resp.ok) throw new Error("Error consultando servicio de direcciones");
      return resp.json();
    })
    .then(function (items) {
      if (Array.isArray(items)) {
        for (var k = 0; k < items.length; k++) {
          var item = items[k];
          var latNum = parseFloat(item.lat);
          var lngNum = parseFloat(item.lon);
          if (isNaN(latNum) || isNaN(lngNum)) continue;

          var partes = String(item.display_name || "").split(",");
          var tituloExt = item.name || partes[0] || q;
          var subExt = partes.slice(1, 4).join(",").trim() || "Santa Marta";

          resultados.push({
            titulo: tituloExt,
            subtitulo: subExt,
            lat: Number(latNum.toFixed(6)),
            lng: Number(lngNum.toFixed(6)),
            origen: "nominatim"
          });
        }
      }
      return resultados.slice(0, 7);
    })
    .catch(function () {
      return resultados.slice(0, 7);
    });
}
