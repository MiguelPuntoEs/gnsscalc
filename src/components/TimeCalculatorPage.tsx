import { useState } from 'react';
import { getTimeDifference } from 'gnss-js';
import GNSSForm from './GNSSForm/GNSSForm';
import GNSSTimeDifference from './GNSSTimeDifference/GNSSTimeDifference';

export default function TimeCalculatorPage() {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [finalDate, setFinalDate] = useState<Date>(new Date());

  return (
    <section className="flex flex-wrap gap-6">
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
