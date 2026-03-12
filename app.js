document.addEventListener('DOMContentLoaded', () => {
  const BACKEND_URL = null;
  const STORAGE_KEY = 'allaus_pendents';

  const INITIAL_CENTER = [42.45, 1.75];
  const INITIAL_ZOOM = 10;
  const FOCUS_ZOOM = 14;

  let map;
  let marcador = null;
  let latSelected = null;
  let lonSelected = null;
  let fotos = [];
  let editIndex = null;

  const inputObservador = document.getElementById('input-observador');
  const inputData = document.getElementById('input-data');
  const inputLloc = document.getElementById('input-lloc');
  const inputMida = document.getElementById('input-mida');
  const inputTipus = document.getElementById('input-tipus');
  const inputComentaris = document.getElementById('input-comentaris');
  const inputFoto = document.getElementById('input-foto');
  const previewContainer = document.getElementById('preview-container');
  const coordsInfo = document.getElementById('coords-info');
  const btnGuardar = document.getElementById('btn-guardar');
  const btnSync = document.getElementById('btn-sync');
  const llistaRegistres = document.getElementById('llista-registres');
  const comptador = document.getElementById('comptador');
  const btnGps = document.getElementById('btn-gps');
  const btnMapGps = document.getElementById('btn-map-gps');

  function formatDateDisplay(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function isValidDateDDMMYYYY(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return false;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  function autoFormatDate(value) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function updateCoordsInfo() {
    if (latSelected === null || lonSelected === null) {
      coordsInfo.textContent = '🗺️ Cap ubicació seleccionada';
      return;
    }

    coordsInfo.textContent = `📍 Lat: ${latSelected.toFixed(6)} | Lon: ${lonSelected.toFixed(6)}`;
  }

  function setMarker(lat, lon, label = "Ubicació de l'allau") {
    latSelected = lat;
    lonSelected = lon;
  
    coordsInfo.innerHTML = `✅ Lat: <strong>${lat.toFixed(5)}</strong>, Lon: <strong>${lon.toFixed(5)}</strong>`;
  
    if (marcador) {
      map.removeLayer(marcador);
    }
  
    marcador = L.marker([lat, lon], { draggable: true })
      .addTo(map)
      .bindPopup(label)
      .openPopup();
  
    marcador.on('dragend', function () {
      const pos = marcador.getLatLng();
      setMarker(pos.lat, pos.lng, "Ubicació ajustada");
    });
  }

  function renderFotos() {
    previewContainer.innerHTML = '';

    fotos.forEach((foto, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-img-wrapper';
      wrapper.innerHTML = `
        <img src="${foto}" alt="Foto ${index + 1}">
        <button type="button" class="btn-remove-foto" data-index="${index}">✕</button>
      `;
      previewContainer.appendChild(wrapper);
    });

    previewContainer.querySelectorAll('.btn-remove-foto').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.index);
        fotos.splice(index, 1);
        renderFotos();
      });
    });
  }

  async function getDrafts() {
    return (await localforage.getItem(STORAGE_KEY)) || [];
  }

  async function saveDrafts(drafts) {
    await localforage.setItem(STORAGE_KEY, drafts);
  }

  function clearForm() {
    inputObservador.value = '';
    inputData.value = formatDateDisplay(new Date());
    inputLloc.value = '';
    inputMida.value = '';
    inputTipus.value = '';
    inputComentaris.value = '';
    inputFoto.value = '';
    fotos = [];
    editIndex = null;

    if (map) {
      if (marcador) {
        map.removeLayer(marcador);
        marcador = null;
      }
      map.setView(INITIAL_CENTER, INITIAL_ZOOM);
    }

    latSelected = null;
    lonSelected = null;
    updateCoordsInfo();
    renderFotos();
    btnGuardar.textContent = '💾 Guardar al dispositiu (offline)';
  }

  async function carregarDadesLocals() {
    const dades = await getDrafts();
    llistaRegistres.innerHTML = '';

    if (dades.length === 0) {
      llistaRegistres.innerHTML = '<p class="map-hint">No tens registres pendents.</p>';
      comptador.textContent = '0';
      btnSync.style.display = 'none';
      return;
    }

    dades.forEach((allau, index) => {
      const thumbs = (allau.fotos || [])
        .slice(0, 2)
        .map((foto) => `<img src="${foto}" alt="Miniatura">`)
        .join('');

      const item = document.createElement('div');
      item.className = 'registre';
      item.innerHTML = `
        <div class="registre-top">
          <div class="thumblist">${thumbs}</div>
          <div class="info-txt">
            <strong>#${index + 1} - ${allau.lloc || 'Sense lloc'}</strong>
            <span><strong>Observador:</strong> ${allau.observador || '-'}</span><br>
            <span><strong>Data:</strong> ${allau.data_observacio || '-'}</span><br>
            <span>${allau.mida || '-'} | ${allau.tipus || '-'}</span>
            <div class="foto-count">${(allau.fotos || []).length} foto(s)</div>
          </div>
        </div>
        <div class="registre-accions">
          <button type="button" class="btn-sm btn-editar" data-index="${index}">Editar</button>
          <button type="button" class="btn-sm btn-esborrar" data-index="${index}">Esborrar</button>
        </div>
      `;
      llistaRegistres.appendChild(item);
    });

    comptador.textContent = String(dades.length);
    btnSync.style.display = 'block';

    llistaRegistres.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = Number(btn.dataset.index);
        const dadesLocals = await getDrafts();
        const allau = dadesLocals[index];
        if (!allau) return;

        editIndex = index;
        inputObservador.value = allau.observador || '';
        inputData.value = allau.data_observacio || '';
        inputLloc.value = allau.lloc || '';
        inputMida.value = allau.mida || '';
        inputTipus.value = allau.tipus || '';
        inputComentaris.value = allau.comentaris || '';
        fotos = [...(allau.fotos || [])];
        renderFotos();

        if (typeof allau.lat === 'number' && typeof allau.lon === 'number') {
          setMarker(allau.lat, allau.lon);
        }

        btnGuardar.textContent = '💾 Actualitzar registre';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    llistaRegistres.querySelectorAll('.btn-esborrar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = Number(btn.dataset.index);
        const dadesLocals = await getDrafts();
        dadesLocals.splice(index, 1);
        await saveDrafts(dadesLocals);

        if (editIndex === index) {
          clearForm();
        }

        await carregarDadesLocals();
      });
    });
  }

  function createBaseLayers() {
    const wmsUrl = 'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wms';

    const commonOptions = {
      format: 'image/png',
      transparent: false,
      version: '1.1.1',
      crs: L.CRS.EPSG3857,
      attribution: '&copy; ICGC'
    };

    const topo = L.tileLayer.wms(wmsUrl, {
      ...commonOptions,
      layers: 'topografic'
    });

    const orto = L.tileLayer.wms(wmsUrl, {
      ...commonOptions,
      layers: 'orto'
    });

    return { topo, orto };
  }

  function initMap() {
    const icgcTopo = L.tileLayer(
      'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW/{z}/{y}/{x}.png',
      {
        maxZoom: 19,
        attribution: '&copy; ICGC'
      }
    );
  
    const icgcOrto = L.tileLayer(
      'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/orto/MON3857NW/{z}/{y}/{x}.png',
      {
        maxZoom: 19,
        attribution: '&copy; ICGC'
      }
    );
  
    map = L.map('map', {
      center: [42.400, 1.800],
      zoom: 8,
      layers: [icgcTopo]
    });
  
    L.control.layers(
      {
        'Mapa Topogràfic': icgcTopo,
        'Ortofoto Vigent': icgcOrto
      },
      null,
      { position: 'topright' }
    ).addTo(map);
  
    map.on('click', function (e) {
      setMarker(e.latlng.lat, e.latlng.lng);
    });
  
    setTimeout(() => {
      map.invalidateSize();
    }, 500);
  }

  btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('El dispositiu no permet geolocalització.');
      return;
    }
  
    coordsInfo.innerText = 'Buscant satèl·lits... 🛰️';
  
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        setMarker(pos.coords.latitude, pos.coords.longitude, "La meva posició GPS");
      },
      () => {
        coordsInfo.innerHTML = "<span style='color:red;'>Error de GPS.</span>";
      },
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 }
    );
  });

  btnMapGps.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-map-gps');
  
    if (!navigator.geolocation) {
      alert('Geolocalització no suportada.');
      return;
    }
  
    btn.innerText = '⏳';
  
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        btn.innerText = '🎯';
      },
      () => {
        alert('Error obtenint ubicació.');
        btn.innerText = '🎯';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  inputData.addEventListener('input', () => {
    inputData.value = autoFormatDate(inputData.value);
  });

  inputFoto.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        fotos.push(e.target.result);
        renderFotos();
      };
      reader.readAsDataURL(file);
    });

    inputFoto.value = '';
  });

  btnGuardar.addEventListener('click', async () => {
    const observador = inputObservador.value.trim();
    const dataObservacio = inputData.value.trim();
    const lloc = inputLloc.value.trim();
    const mida = inputMida.value;
    const tipus = inputTipus.value;
    const comentaris = inputComentaris.value.trim();

    if (!observador) {
      alert('Introdueix l\'observador.');
      return;
    }

    if (!isValidDateDDMMYYYY(dataObservacio)) {
      alert('La data ha de tenir format DD/MM/AAAA.');
      return;
    }

    if (latSelected === null || lonSelected === null) {
      alert('Toca el mapa o usa el GPS per situar l\'allau.');
      return;
    }

    if (!lloc) {
      alert('Escriu el nom del sector o lloc.');
      return;
    }

    if (fotos.length === 0) {
      alert('Afegeix almenys una fotografia.');
      return;
    }

    const novaAllau = {
      observador,
      data_observacio: dataObservacio,
      lloc,
      mida,
      tipus,
      comentaris,
      lat: latSelected,
      lon: lonSelected,
      fotos: [...fotos],
      created_at: new Date().toISOString()
    };

    const dades = await getDrafts();

    if (editIndex !== null) {
      dades[editIndex] = novaAllau;
    } else {
      dades.push(novaAllau);
    }

    await saveDrafts(dades);
    clearForm();
    await carregarDadesLocals();
    alert('✅ Registre guardat al dispositiu.');
  });

  btnSync.addEventListener('click', async () => {
    const dades = await getDrafts();

    if (dades.length === 0) return;

    if (!navigator.onLine) {
      alert('❌ No tens internet per sincronitzar.');
      return;
    }

    if (!BACKEND_URL) {
      alert('Versió demo: la sincronització real encara no està connectada al backend.');
      return;
    }

    const originalText = btnSync.textContent;
    btnSync.textContent = '⏳ Sincronitzant...';

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dades)
      });

      if (!response.ok) {
        throw new Error('Error de servidor');
      }

      await localforage.removeItem(STORAGE_KEY);
      await carregarDadesLocals();
      alert('🚀 Dades enviades correctament.');
    } catch (error) {
      alert('❌ No s\'han pogut enviar les dades.');
    } finally {
      btnSync.textContent = originalText;
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  initMap();
  inputData.value = formatDateDisplay(new Date());
  updateCoordsInfo();
  carregarDadesLocals();
});
