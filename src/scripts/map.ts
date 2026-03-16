interface Location {
  name: string;
  lat: number;
  long: number;
  link?: string;
}

let locations: Location[];
let mapLoaded = false;
let locationsLoaded = false;

const width = 758;
const height = 400;
let scale: number;

const img = new Image();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
if (canvas) {
  const ctx = canvas.getContext('2d')!;

  window.addEventListener('load', () => {
    const elem = canvas.getBoundingClientRect();
    const newWidth = Math.abs(elem.right - elem.left);
    scale = width / newWidth;
  });

  const mapContainer = document.getElementById('map-container')!;
  const mapSelectedLink = document.querySelector('.map-selected-link') as HTMLAnchorElement;
  const mapSelectedName = document.querySelector('.map-selected-name') as HTMLElement;
  const mapSelectedMoreText = document.getElementById('more-text')!;

  fetch('/locations.json')
    .then(response => response.json())
    .then((json: Location[]) => {
      locations = json;
      if (mapLoaded) {
        createLocations();
        locationsLoaded = true;
      }
    });

  img.addEventListener('load', () => {
    if (!locationsLoaded && locations) {
      createLocations();
    }
    ctx.drawImage(img, 0, 0, width, height);
    mapLoaded = true;
  }, false);

  img.src = '/images/map.png';

  const getCoords = (latitude: number, longitude: number) => {
    const x = width * (180 + longitude) / 360 - 25;
    const y = height * (90 - latitude) / 180 + 45;
    return { x, y };
  };

  const LOCATION_RADIUS = 6;

  const createLocations = () => {
    locations.forEach(location => {
      const { x, y } = getCoords(location.lat, location.long);
      ctx.beginPath();
      ctx.arc(x, y, LOCATION_RADIUS, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#C2E812';
      ctx.fill();
    });
  };

  const getClickCoords = (event: MouseEvent | TouchEvent) => {
    const container = canvas.getBoundingClientRect();
    const clientX = 'clientX' in event ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = 'clientY' in event ? event.clientY : (event as TouchEvent).touches[0].clientY;
    return { x: clientX - container.left, y: clientY - container.top };
  };

  const isMapElement = (e: MouseEvent | TouchEvent) => {
    const { x, y } = getClickCoords(e);
    return locations.find(element => {
      const { x: elemX, y: elemY } = getCoords(element.lat, element.long);
      const xDiff = Math.abs(elemX / scale - x);
      const yDiff = Math.abs(elemY / scale - y);
      return xDiff <= LOCATION_RADIUS && yDiff <= LOCATION_RADIUS;
    });
  };

  const handleMapClick = (e: MouseEvent | TouchEvent) => {
    const element = isMapElement(e);
    if (element) {
      if (element.link?.length) {
        mapSelectedLink.href = element.link;
        mapSelectedMoreText.style.display = 'block';
        mapSelectedLink.style.pointerEvents = 'auto';
      } else {
        mapSelectedLink.href = '';
        mapSelectedMoreText.style.display = 'none';
        mapSelectedLink.style.pointerEvents = 'none';
      }
      mapSelectedName.innerText = element.name;
      const { x, y } = getCoords(element.lat, element.long);
      mapSelectedLink.style.top = `${y / scale}px`;
      mapSelectedLink.style.left = `${x / scale}px`;
      mapSelectedLink.style.display = 'flex';
      setTimeout(() => {
        mapSelectedLink.style.opacity = '1';
        (mapSelectedLink.style as any).scale = '1';
      }, 1);
    }
  };

  canvas.addEventListener('click', (e) => handleMapClick(e), false);
  canvas.addEventListener('touchstart', (e) => handleMapClick(e), false);
  canvas.addEventListener('mousemove', (e) => {
    if (isMapElement(e)) canvas.style.cursor = 'pointer';
  });
}
