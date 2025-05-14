import { useEffect, useState } from 'react';
import styles from './positioning.module.scss';
import PositionForm from '@/components/PositionForm';
import AERForm from '@/components/AERForm';
import ENUForm from '@/components/ENUForm';
import { getPositionFromGeodetic } from '@/util/positioning';
import { Position } from '@/types/position';

export default function Positioning() {
  const [position, setPosition] = useState<Position>([
    4263871.9243, 722591.1075, 4672986.8878,
  ]);
  const [refPosition, setRefPosition] = useState<Position>([
    4253871.9243, 712591.1075, 4072986.8878,
  ]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude, altitude } }) =>
          setRefPosition(getPositionFromGeodetic(latitude, longitude, altitude))
      );
    }
  }, []);

  return (
    <>
      <h1>GNSS Time Calculator</h1>
      <section className={styles.calculator}>
        <PositionForm
          title="Position"
          position={position}
          onPositionChange={setPosition}
        />
        <PositionForm
          title="Reference Position"
          position={refPosition}
          onPositionChange={setRefPosition}
        />
        <AERForm
          title="AER coordinates"
          position={position}
          refPosition={refPosition}
        />
        <ENUForm
          title="ENU coordinates"
          position={position}
          refPosition={refPosition}
        />
      </section>
      <section className={styles.glossary}>
        <aside>
          <h2>Glossary</h2>
        </aside>
        <div>
          <p>
            <strong>X</strong> [m] is the x-component of the corresponding
            position in the global (x, y, z) ECEF cartesian system.
          </p>
          <p>
            <strong>Y</strong> [m] is the y-component of the corresponding
            position in the global (x, y, z) ECEF cartesian system.
          </p>
          <p>
            <strong>Z</strong> [m] is the z-component of the corresponding
            position in the global (x, y, z) ECEF cartesian system.
          </p>
          <p>
            <strong>Height</strong> [m] is the ellipsoidal height of the
            corresponding position in the ellipsoidal (geodetic) system (φ,
            &lambda;, h) expressed in meters.
          </p>
          <p>
            <strong>&theta;</strong> [&deg;] is the elevation of the entered
            position in the reference local coordinate system expressed in
            degrees.
          </p>
          <p>
            <strong>&phi;</strong> [&deg;] is the azimuth of the entered
            position in the reference local coordinate system expressed in
            degrees.
          </p>
          <p>
            <strong>&rho;</strong> [&deg;] is the slant range of the entered
            position in the reference local coordinate system expressed in
            meters.
          </p>
          <p>
            <strong>&Delta;E</strong> [m] is the East component of the entered
            position in the reference local coordinate system East-North-Up
            (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
          </p>
          <p>
            <strong>&Delta;N</strong> [m] is the North component of the entered
            position in the reference local coordinate system East-North-Up
            (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
          </p>
          <p>
            <strong>&Delta;U</strong> [m] is the Up component of the entered
            position in the reference local coordinate system East-North-Up
            (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
          </p>
          <p>
            <strong>ECEF</strong> Acronym for Earth-Centered, Earth-Fixed.
          </p>
        </div>
      </section>
    </>
  );
}
