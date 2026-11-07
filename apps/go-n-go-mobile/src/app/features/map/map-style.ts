interface MapPalette {
  background: string;
  land: string;
  water: string;
  road: string;
  majorRoad: string;
  roadHalo: string;
  text: string;
  textHalo: string;
  boundary: string;
}

const palettes: Record<'day' | 'night', MapPalette> = {
  day: {
    background: '#e8eee8',
    land: '#f5f4ed',
    water: '#a9d8e8',
    road: '#ffffff',
    majorRoad: '#f4c86a',
    roadHalo: '#b8b2a1',
    text: '#35433d',
    textHalo: '#f8f7f1',
    boundary: '#d1a5a0',
  },
  night: {
    background: '#15211f',
    land: '#202e2a',
    water: '#193b4a',
    road: '#77857e',
    majorRoad: '#c9974a',
    roadHalo: '#26332f',
    text: '#e4ebe6',
    textHalo: '#202e2a',
    boundary: '#8b6667',
  },
};

export function createMapStyle(tileServerUrl: string, night: boolean): object {
  const baseUrl = tileServerUrl.replace(/\/+$/, '');
  const palette = palettes[night ? 'night' : 'day'];

  return {
    version: 8,
    glyphs: `${baseUrl}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      osm: {
        type: 'vector',
        tiles: [
          `${baseUrl}/data/malaysia-singapore-brunei-shortbread-1.0/{z}/{x}/{y}.pbf`,
        ],
        minzoom: 0,
        maxzoom: 14,
        attribution: '© OpenStreetMap contributors · Geofabrik · ODbL 1.0',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': palette.background } },
      {
        id: 'land',
        type: 'fill',
        source: 'osm',
        'source-layer': 'land',
        paint: { 'fill-color': palette.land },
      },
      {
        id: 'ocean',
        type: 'fill',
        source: 'osm',
        'source-layer': 'ocean',
        paint: { 'fill-color': palette.water },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water_polygons',
        paint: { 'fill-color': palette.water },
      },
      {
        id: 'water-lines',
        type: 'line',
        source: 'osm',
        'source-layer': 'water_lines',
        paint: { 'line-color': palette.water, 'line-width': 1.5 },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundaries',
        paint: {
          'line-color': palette.boundary,
          'line-width': 1,
          'line-dasharray': [2, 2],
        },
      },
      {
        id: 'street-polygons',
        type: 'fill',
        source: 'osm',
        'source-layer': 'street_polygons',
        paint: { 'fill-color': palette.road },
      },
      {
        id: 'streets',
        type: 'line',
        source: 'osm',
        'source-layer': 'streets',
        paint: {
          'line-color': [
            'match',
            ['get', 'kind'],
            'motorway',
            palette.majorRoad,
            'trunk',
            palette.majorRoad,
            'primary',
            palette.majorRoad,
            palette.road,
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 4],
          'line-opacity': 0.95,
        },
      },
      {
        id: 'boundary-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'boundary_labels',
        minzoom: 3,
        layout: {
          'symbol-placement': 'point',
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name_en']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': palette.text,
          'text-halo-color': palette.textHalo,
          'text-halo-width': 1,
        },
      },
      {
        id: 'street-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'street_labels',
        minzoom: 10,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'ref'], ['get', 'name'], ['get', 'name_en']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-max-angle': 35,
        },
        paint: {
          'text-color': palette.text,
          'text-halo-color': palette.textHalo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place_labels',
        minzoom: 3,
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name_en']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 15],
          'text-max-width': 9,
        },
        paint: {
          'text-color': palette.text,
          'text-halo-color': palette.textHalo,
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}
