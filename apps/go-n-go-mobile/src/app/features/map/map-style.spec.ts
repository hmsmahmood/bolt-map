import { createMapStyle } from './map-style';

describe('createMapStyle', () => {
  it('uses the configured Shortbread tiles and preserves OSM attribution', () => {
    const style = createMapStyle('https://maps.example.test/', false) as {
      glyphs: string;
      sources: Record<string, { tiles: string[]; attribution: string; maxzoom: number }>;
      layers: Array<{ id: string }>;
    };

    expect(style.glyphs).toBe('https://maps.example.test/fonts/{fontstack}/{range}.pbf');
    expect(style.sources['osm'].tiles).toEqual([
      'https://maps.example.test/data/malaysia-singapore-brunei-shortbread-1.0/{z}/{x}/{y}.pbf',
    ]);
    expect(style.sources['osm'].maxzoom).toBe(14);
    expect(style.sources['osm'].attribution).toContain('OpenStreetMap contributors');
    expect(style.layers.map(({ id }) => id)).toContain('street-labels');
    expect(style.layers.map(({ id }) => id)).toContain('place-labels');
  });

  it('provides a separate night palette without changing the tile provider', () => {
    const day = createMapStyle('http://localhost:8080', false) as {
      layers: Array<{ id: string; paint?: Record<string, string> }>;
      sources: Record<string, { tiles: string[] }>;
    };
    const night = createMapStyle('http://localhost:8080', true) as {
      layers: Array<{ id: string; paint?: Record<string, string> }>;
      sources: Record<string, { tiles: string[] }>;
    };
    const backgroundColor = (style: typeof day) =>
      style.layers.find(({ id }) => id === 'background')?.paint?.['background-color'];

    expect(backgroundColor(night)).not.toBe(backgroundColor(day));
    expect(night.sources['osm'].tiles).toEqual(day.sources['osm'].tiles);
  });
});
