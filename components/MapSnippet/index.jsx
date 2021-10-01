import Head from 'next/head';
import { useEffect, useState } from 'react';
import { usePositionCalculator } from '../../hooks/positioning';
import { getPositionFromGeodetic } from '../../util/positioning';

export default function MapSnippet({
  position = [4263871.9243, 722591.1075, 4672988.8878],
  setPosition,
}) {
  const { latitude, longitude } = usePositionCalculator(position);

  function initMap() {
    const map = new window.google.maps.Map(document.getElementById('map'), {
      center: { lat: 47.4, lng: 9.61 },
      zoom: 8,
      disableDefaultUI: true,
    });

    map.addListener('click', (mapsMouseEvent) => {
      console.log(mapsMouseEvent.latLng.lat());
      console.log(setPosition);
      setPosition(
        getPositionFromGeodetic(
          mapsMouseEvent.latLng.lat(),
          mapsMouseEvent.latLng.lng(),
          0
        )
      );
    });

    return map;
  }

  function initMarker(map) {
    return new window.google.maps.Marker({
      position: { lat: latitude.value, lng: longitude.value },
      // position: { lat: 47.4, lng: 9.61 },
      map,
    });
  }

  const [map, setMap] = useState();
  const [marker, setMarker] = useState();

  useEffect(() => {
    setMap(initMap());
  }, []);

  useEffect(() => {
    setMarker(initMarker(map));
  }, [map]);

  useEffect(() => {
    if (marker !== undefined) {
      marker.setPosition({ lat: latitude.value, lng: longitude.value });
    }
    // if (map !== undefined) {
    //   map.setCenter({ lat: latitude.value, lng: longitude.value });
    // }
  }, [position]);

  return (
    <>
      <Head>
        <script
          src="https://maps.googleapis.com/maps/api/js?key=***REMOVED***&libraries=&v=weekly"
          async
        />
      </Head>
      <div id="map" style={{ width: '500px', height: '500px' }} />
    </>
  );
}
