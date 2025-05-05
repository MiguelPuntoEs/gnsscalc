import { useState } from 'react';
import { getTimeDifference } from 'gnss-js';
import GNSSForm from '@/components/GNSSForm';
import GNSSTimeDifference from '@/components/GNSSTimeDifference';
import styles from './index.module.scss';

export default function Index() {
  const [startDate, setStartDate] = useState(new Date());
  const [finalDate, setFinalDate] = useState(new Date());

  return (
    <>
      <h1>GNSS Time Calculator</h1>
      <section className={styles.calculator}>
        <GNSSForm
          title="Initial Time"
          date={startDate}
          onDateChange={setStartDate}
        />

        <GNSSForm
          title="Final Time"
          date={finalDate}
          onDateChange={setFinalDate}
        />

        <GNSSTimeDifference
          timeDifference={getTimeDifference(startDate, finalDate)}
          onTimeDifferenceChange={(timeDifference) => {
            setFinalDate(new Date(startDate.getTime() + timeDifference));
          }}
        />
      </section>

      <section className={styles.glossary}>
        <aside>
          <h2>Glossary</h2>
        </aside>
        <div>
          <p>
            <strong>GPS Time</strong> is the number of seconds since January 6,
            1980, 00:00:00
          </p>
          <p>
            <strong>GAL Time</strong> (Galileo Time) is the number of seconds
            since August 22, 1999, 00:00:00
          </p>
          <p>
            <strong>UNIX Time</strong> is the number of seconds since January 1,
            1970, 00:00:00
          </p>
          <p>
            <strong>Julian Date</strong> is the number of days since January 1,
            4713 B.C., 12:00:00; defines the number of mean solar days elapsed
            since the epoch January 1.5d, 4713 before Christ.[Hoffman-Wellenhof]
          </p>
          <p>
            <strong>MJD</strong> (Modified Julian Date) is the number of days
            since January 1, 4713 B.C., 00:00:00, removing the first two digits.
            MJD=JD-24000000.5
          </p>
          <p>
            <strong>MJD2000</strong> (Modified Julian Date 2000) is the number
            of days since January 1, 2000, 00:00:00
          </p>
          <p>
            <em>Important note:</em> No leap seconds are considered in the
            computations except for TAI and TT
          </p>
          <p>Leap second information is obtained from  <a href="https://data.iana.org/time-zones/data/leap-seconds.list" target="_blank" rel="noopener noreferrer">IANA</a>.</p>
          <p>Leap seconds to be updated December 2025. For latest leap second information check <a href="https://datacenter.iers.org/data/latestVersion/bulletinC.txt" target="_blank" rel="noopener noreferrer">IERS Bulletin C</a>.</p>
        </div>
      </section>
    </>
  );
}
