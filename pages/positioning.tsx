import Page from "components/Page";
import AERForm from "components/Position/AERForm";
import ENUForm from "components/Position/ENUForm";
import PositionGlossary from "components/Position/Glossary";
import PositionForm from "components/Position/PositionForm";
import Stack from "components/Stack";
import { NextPage } from "next";
import { useEffect, useState } from "react";
import { Position } from "types/position";
import { getPositionFromGeodetic } from "util/positioning";

const PositioningPage: NextPage = () => {
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
          setRefPosition(getPositionFromGeodetic(latitude, longitude, altitude || 0) as Position)
      );
    }
  }, []);

  return (
    <Page title="Positioning">
      <Stack sx={{ gap: 2, "& > *": { m: "0 auto", flexBasis: "max(20%, 320px)" }, mb: 2 }} horizontal>
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
          position={position}
          refPosition={refPosition}
        />
        <ENUForm
          position={position}
          refPosition={refPosition}
        />
      </Stack>
      <PositionGlossary />
    </Page >
  );
};

export default PositioningPage;