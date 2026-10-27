// Basemaps. Works with NO key (OpenStreetMap). For a more modern style, add a free MapTiler key:
//   VITE_MAPTILER_KEY=your_key   (in .env locally and in Vercel project settings)
const MAPTILER_KEY = (import.meta.env.VITE_MAPTILER_KEY || '').trim();

export const STREET_TILES = MAPTILER_KEY
  ? {
      url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`,
      maxZoom: 20,
      maxNativeZoom: 20,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  : {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

// Satellite imagery (no key). Shows new buildings that street maps may not have yet.
export const SATELLITE_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 20,
  maxNativeZoom: 18,
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
};
