/* Physics and scenario logic for the tsunami lab. Shared by index.html and verify.html. */
const TSU = (() => {
  const G = 9.81;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Shallow-water wave speed: c = sqrt(g * depth)
  const speedMS = depth => Math.sqrt(G * depth);
  const speedKMH = depth => speedMS(depth) * 3.6;
  // Green's law: amplitude grows as depth^(-1/4) when a wave moves into shallower water
  const greens = (a0, h0, h) => a0 * Math.pow(h0 / h, 0.25);

  // Fixed routes for step 3
  const ROUTES = {
    seaside: { km: 100, depth: 1000 },   // Cascadia rupture to the Oregon coast, mostly over the continental shelf and slope
    japan: { km: 7200, depth: 4500 }     // Across the North Pacific to Otsuchi, northeast Japan (great-circle distance)
  };
  const travelHours = r => r.km / speedKMH(r.depth);

  // Step 4: Hunga Tonga 2022 race to Japan (model)
  const TONGA = { km: 7800, pressureKMH: 700 * 1.609, depth: 4500 };   // great-circle distance to the Tokyo area

  // Step 5: asteroid kinetic energy (megatons of TNT), stony density 3000 kg/m3
  const MT = 4.184e15;
  const impactMt = (dKm, vKmS) => 0.5 * 3000 * (Math.PI / 6) * Math.pow(dKm * 1000, 3) * Math.pow(vKmS * 1000, 2) / MT;

  // Step 6: evacuation scenario, made from the scenario number
  const PEOPLE = [
    { who: 'walking with a grandparent who uses a cane', speed: 0.9 },
    { who: 'carrying a toddler', speed: 1.0 },
    { who: 'walking at a normal pace', speed: 1.2 },
    { who: 'walking briskly', speed: 1.4 }
  ];
  function build(seed) {
    const rng = mulberry32(seed * 2654435761 >>> 0);
    const arrival = 15 + Math.floor(rng() * 11);            // minutes after shaking starts
    const person = PEOPLE[Math.floor(rng() * PEOPLE.length)];
    const delay = 10;                                        // minutes of shaking, shock and getting going
    const window = arrival - delay;                          // minutes available for walking
    const offset = rng() < 0.5 ? -(3.5 + rng() * Math.min(2, window - 4)) : (2 + rng() * 4);   // clearly safe or clearly too late
    const high = Math.max(60, Math.round((window + offset) * 60 * person.speed / 10) * 10);   // meters to high ground
    const tower = Math.round(Math.min(120 + rng() * 150, (window - 1.5) * 60 * person.speed) / 10) * 10; // always reachable
    const walkHigh = high / person.speed / 60, walkTower = tower / person.speed / 60;
    const safeHigh = delay + walkHigh <= arrival - 2;
    return { seed, arrival, person, high, tower, delay, walkHigh, walkTower, safeHigh, best: safeHigh ? 'high' : 'tower' };
  }

  function verifyCode(name, seed) {
    const s = name.trim().toLowerCase().replace(/\s+/g, ' ') + '|' + seed + '|race-the-wave-lab-v1';
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 + s.charCodeAt(i) * 31, 2246822519) >>> 0;
    }
    const str = (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(8, 'X');
    return str.slice(0, 4) + '-' + str.slice(4, 8);
  }

  const R_EARTH = 6371, RAD = Math.PI / 180;
  function gcKm(lat1, lon1, lat2, lon2) {
    const a = Math.sin((lat2 - lat1) * RAD / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin((lon2 - lon1) * RAD / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(a));
  }
  // Points on a circle of radius rKm around a center, following the Earth's surface
  function geoCircle(lat, lon, rKm, n = 180) {
    const out = [], d = rKm / R_EARTH, la1 = lat * RAD, lo1 = lon * RAD;
    for (let i = 0; i <= n; i++) {
      const b = i / n * 2 * Math.PI;
      const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
      const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
      out.push([la2 / RAD, lo2 / RAD]);
    }
    return out;
  }
  return { gcKm, geoCircle, G, speedMS, speedKMH, greens, ROUTES, travelHours, TONGA, impactMt, build, verifyCode, mulberry32 };
})();
