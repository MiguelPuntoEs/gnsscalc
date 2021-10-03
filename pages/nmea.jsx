import Head from 'next/head';
import NMEAPage from '../components/pages/NMEA';

export default function Index() {
  const title = 'GNSS Calculator | NMEA Plotter';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <NMEAPage />
    </>
  );
}
