import { useState } from 'react';
import { getTimeDifference } from 'gnss-js';
import GNSSForm from './GNSSForm/GNSSForm';
import GNSSTimeDifference from './GNSSTimeDifference/GNSSTimeDifference';

function roundedNow() {
  const now = new Date();
  now.setMilliseconds(0);
  return now;
}

export default function TimeCalculatorPage() {
  const [startDate, setStartDate] = useState<Date>(roundedNow);
  const [finalDate, setFinalDate] = useState<Date>(roundedNow);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
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
  );
}
