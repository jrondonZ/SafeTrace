// --- Config ---
const CT_MUNICIPALITIES_GEOJSON =
  "https://services.arcgis.com/OKt1GlOQ0VQ53M2G/arcgis/rest/services/CTDOT_Municipalities/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
// Official CTDOT towns layer (169 municipalities). 

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"; // DOC 2.0 (JSON). 

let townsFC = null;
let selectedTown = null;

// --- Map (D3 SVG) ---
const width = document.getElementById('map').clientWidth;
const height = document.getElementById('map').clientHeight;
const svg = d3.select('#map').append('svg').attr('width', width).attr('height', height);
const g = svg.append('g');
const projection = d3.geoMercator();
const path = d3.geoPath(projection);

// Load towns and render
init();

async function init() {
  townsFC = await (await fetch(CT_MUNICIPALITIES_GEOJSON)).json(); // GeoJSON FeatureCollection

  // Fit projection to CT
  const bounds = d3.geoBounds(townsFC);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  const cx = (bounds[0][0] + bounds[1][0]) / 2;
  const cy = (bounds[0][1] + bounds[1][1]) / 2;
  const scale = Math.min(width / dx / 1.5, height / dy / 1.5);
  projection.scale(scale * 100).center([cx, cy]).translate([width/2, height/2]);

  // Draw towns
  g.selectAll('path.town')
    .data(townsFC.features)
    .join('path')
    .attr('class', 'town')
    .attr('d', path)
    .attr('fill', '#4F46E5')
    .attr('fill-opacity', 0.12)
    .attr('stroke', '#312E81')
    .attr('stroke-width', 0.8)
    .on('click', (e, d) => {
      selectTown(d);
    });

  // Populate dropdown
  const select = document.getElementById('townSelect');
  townsFC.features
    .map(f => ({ id: f.properties.OBJECTID, name: f.properties.Municipality }))
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  select.addEventListener('change', e => {
    const town = townsFC.features.find(f => f.properties.Municipality === e.target.value);
    if (town) selectTown(town);
  });

  // Wire "Use My Location"
  document.getElementById('btnLocate').addEventListener('click', geolocate);

  // Default: center on New Haven
  const defaultTown = townsFC.features.find(f => f.properties.Municipality === 'New Haven');
  if (defaultTown) selectTown(defaultTown);
}

function selectTown(feature) {
  selectedTown = feature;
  // highlight
  g.selectAll('path.town').attr('fill-opacity', d => d === feature ? 0.25 : 0.12);
  // center view (simple translate: fitExtent alternative)
  const b = path.bounds(feature);
  const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
  const x = (b[0][0] + b[1][0]) / 2, y = (b[0][1] + b[1][1]) / 2;
  const s = 0.9 / Math.max(dx / width, dy / height);
  const t = [width/2 - s * x, height/2 - s * y];
  g.transition().duration(600).attr('transform', `translate(${t[0]},${t[1]}) scale(${s})`);

  // Update links & lists
  updateNsopwLink(feature);
  updatePoliceLink(feature);
  fetchTownNews(feature);
}

function geolocate() {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(pos => {
    const pt = [pos.coords.longitude, pos.coords.latitude];
    // find containing polygon
    const town = townsFC.features.find(f => d3.geoContains(f, pt));
    if (town) {
      selectTown(town);
      const sel = document.getElementById('townSelect');
      sel.value = town.properties.Municipality;
    } else {
      alert("Couldn't match your location to a CT town.");
    }
  }, err => alert("Geolocation failed: " + err.message), { enableHighAccuracy: true, timeout: 8000 });
}

function updateNsopwLink(feature) {
  const town = feature.properties.Municipality;
  // NSOPW has a public user-facing search—deep-link the user to official site (no scraping). 
  const url = "https://www.nsopw.gov/";
  const a = document.getElementById('nsopwLink');
  a.href = url;
  a.textContent = `Search registered offenders near ${town} on NSOPW`;
}

function updatePoliceLink(feature) {
  // Simple heuristic: compose Google query to local PD (many towns host on city domain)
  const town = feature.properties.Municipality + " CT police";
  const href = "https://www.google.com/search?q=" + encodeURIComponent(town);
  const a = document.getElementById('pdLink');
  a.href = href;
  a.textContent = "Find local police site";
}

async function fetchTownNews(feature) {
  const townName = feature.properties.Municipality;
  // GDELT DOC 2.0: query by "<Town>, Connecticut" within last 24h; returns JSON. 
  const params = new URLSearchParams({
    query: `"${townName}, Connecticut"`,
    timespan: "24h",
    format: "json",
    maxrecords: "50"
  });
  try {
    const res = await fetch(`${GDELT_DOC_API}?${params.toString()}`);
    const data = await res.json();
    const items = data.articles || data.documents || [];
    renderNews(items);
  } catch (e) {
    document.getElementById('newsList').innerHTML = `<div class="note">Could not load news.</div>`;
  }
}

function renderNews(items) {
  const list = document.getElementById('newsList');
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = "<div class='note'>No recent headlines found.</div>";
    return;
  }
  items.slice(0, 20).forEach(a => {
    const url = a.url || a.SOURCEURL;
    const title = a.title || a.TITLE || "(untitled)";
    const when = a.seendate || a.DATE;
    const item = document.createElement('a');
    item.className = "item";
    item.href = url; item.target = "_blank"; item.rel = "noopener";
    item.innerHTML = `<div class="meta">${when ? new Date(when).toLocaleString() : ""}</div>
                      <div class="ttl">${title}</div>`;
    list.appendChild(item);
  });
}