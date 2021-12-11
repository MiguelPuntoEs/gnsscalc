import GNSSForm from "components/Time/GNSSForm";
import GNSSTimeDifferenceForm from "components/Time/GNSSTimeDifferenceForm";
import Page from "components/Page";
import Stack from "components/Stack";
import type { NextPage } from "next";
import { useState } from "react";
import TimeGlossary from "components/Time/Glossary";

const Home: NextPage = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());

  return (
    <Page title="Time Calculator">
      <Stack
        sx={{
          mb: 2,
          "& > *": {
            flexBasis: "max(30%, 430px)",
            margin: "0 auto",
          },
        }}
        horizontal
      >
        <GNSSForm
          date={startDate}
          title="Initial Time"
          onDateChange={(d) => d && setStartDate(d)}
        />
        <GNSSForm
          date={endDate}
          title="Final Time"
          onDateChange={(d) => d && setEndDate(d)}
        />
        <GNSSTimeDifferenceForm
          startDate={startDate}
          endDate={endDate}
          onDifferenceChange={(d) => setEndDate(d)}
        />
      </Stack>

      <TimeGlossary />
    </Page>
  );
};

export default Home;
