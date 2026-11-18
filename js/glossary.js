/* Clickable glossary. Any element with class "term" and data-term="key"
   opens a short explainer. Works in the main page and in pop-out windows. */
const GLOSSARY = {
  'tsunami': ['Tsunami', 'A series of ocean waves made when a large volume of water is suddenly pushed up or down - by an earthquake that moves the seafloor, a volcanic explosion or collapse, a landslide, or an asteroid impact. Tsunami is Japanese for "harbor wave".'],
  'wavelength': ['Wavelength', 'The distance from one wave crest to the next. Wind waves at the beach have wavelengths of tens of meters. Tsunamis in the deep ocean can have wavelengths of 100 km or more, and so the whole depth of the ocean moves with them.'],
  'shallow-water-wave': ['Shallow-water wave', 'A wave whose wavelength is much longer than the water is deep. Tsunamis are shallow-water waves even in the deepest ocean, and so their speed depends only on the water depth: speed = square root of (g \u00d7 depth), where g = 9.81 m/s\u00b2.'],
  'shoaling': ['Shoaling', 'What happens as a wave moves into shallower water: it slows down, its wavelength gets shorter, and its height grows as the same energy is squeezed into less water.'],
  'greens-law': ['Green\u2019s law', 'A simple rule for shoaling, worked out by George Green in 1838: wave height grows in proportion to 1 / (depth to the 1/4 power). So when the depth drops to 1/16, the wave gets about twice as tall. Real coastlines with bays and headlands can make waves taller or shorter than this.'],
  'run-up': ['Run-up', 'The highest elevation on land that a tsunami reaches, measured above normal sea level. Run-up is often several times larger than the wave height out at sea.'],
  'megathrust': ['Megathrust earthquake', 'An earthquake on the boundary fault of a subduction zone. These are the largest earthquakes on Earth, and when they lift or drop the seafloor they make the largest tsunamis.'],
  'cascadia': ['Cascadia subduction zone', 'The subduction zone off northern California, Oregon, Washington and British Columbia, where the Juan de Fuca plate sinks beneath North America. Its last great earthquake and tsunami were on January 26, 1700.'],
  'orphan-tsunami': ['Orphan tsunami', 'A tsunami recorded without any earthquake felt nearby. Japanese records describe one in January 1700 that scientists later traced to the Cascadia earthquake.'],
  'dart': ['DART buoy', 'Deep-ocean Assessment and Reporting of Tsunamis. A sensor on the deep seafloor measures the pressure of the water above it, and so it can feel a tsunami pass by and relay the signal through a surface buoy to the tsunami warning centers.'],
  'warning-center': ['Tsunami warning center', 'An office that watches earthquakes and sea level around the clock and sends out tsunami warnings. The U.S. has two, in Alaska and Hawaii, run by NOAA.'],
  'meteotsunami': ['Meteotsunami', 'Sea-level waves pushed along by a fast-moving change in air pressure, not by movement of the seafloor. The 2022 Hunga Tonga eruption sent a pressure wave around the whole planet that made meteotsunamis across the Pacific.'],
  'caldera': ['Caldera', 'A large basin that forms when the ground collapses into an emptied magma chamber. When a volcanic island collapses into the sea, it can push the water aside and make a tsunami.'],
  'pyroclastic-flow': ['Pyroclastic flow', 'A fast avalanche of hot gas, ash and rock from an explosive eruption. Pyroclastic flows that pour into the sea can push the water and make a tsunami.'],
  'kinetic-energy': ['Kinetic energy', 'The energy of motion: half the mass times the speed squared. Double the speed and the energy goes up four times. Double the diameter of a rock and its mass, and so its energy, goes up eight times.'],
  'megaton': ['Megaton', 'A unit of energy equal to one million tons of TNT, about 4.2 \u00d7 10\u00b9\u2075 joules. The Hiroshima bomb released about 0.015 megatons.'],
  'logarithmic': ['Logarithmic scale', 'A scale where each step multiplies by the same amount. Each grid line here is 10 times the one before it.'],
  'vertical-evacuation': ['Vertical evacuation structure', 'A building, tower or berm strong and tall enough to stand above a tsunami, for people who cannot reach high ground in time. The first in North America was Ocosta Elementary School near Westport, Washington, completed in 2016.'],
  'inundation': ['Inundation zone', 'The area of land a tsunami can flood. Tsunami evacuation maps show the zone, and the way out of it, for each coastal town.']
};

const Glossary = (() => {
  function show(term, anchor) {
    const doc = anchor.ownerDocument;
    const entry = GLOSSARY[term];
    if (!entry) return;
    let pop = doc.getElementById('glossaryPop');
    if (!pop) { pop = doc.createElement('div'); pop.id = 'glossaryPop'; pop.className = 'gloss-pop'; doc.body.appendChild(pop); }
    pop.innerHTML = '';
    const close = doc.createElement('button'); close.className = 'close'; close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Close'); close.onclick = () => { pop.hidden = true; };
    const h = doc.createElement('h4'); h.textContent = entry[0];
    const p = doc.createElement('div'); p.textContent = entry[1];
    pop.append(close, h, p);
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = doc.defaultView.innerWidth, hgt = doc.defaultView.innerHeight;
    const pw = Math.min(340, w - 20);
    pop.style.left = Math.max(10, Math.min(r.left, w - pw - 10)) + 'px';
    const below = r.bottom + 8;
    pop.style.top = (below + 160 > hgt ? Math.max(10, r.top - 170) : below) + 'px';
  }
  function attach(doc) {
    doc.addEventListener('click', e => {
      const t = e.target.closest ? e.target.closest('.term') : null;
      const pop = doc.getElementById('glossaryPop');
      if (t) { e.preventDefault(); show(t.dataset.term, t); return; }
      if (pop && !pop.hidden && !pop.contains(e.target)) pop.hidden = true;
    });
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const pop = doc.getElementById('glossaryPop'); if (pop) pop.hidden = true; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('term')) { e.preventDefault(); show(e.target.dataset.term, e.target); }
    });
  }
  function listHTML() {
    return '<dl class="gloss-list">' + Object.keys(GLOSSARY).sort((a, b) => GLOSSARY[a][0].localeCompare(GLOSSARY[b][0]))
      .map(k => `<dt>${GLOSSARY[k][0]}</dt><dd>${GLOSSARY[k][1]}</dd>`).join('') + '</dl>';
  }
  return { attach, show, listHTML };
})();
