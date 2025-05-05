import Head from 'next/head';
import PositioningPage from '../components/pages/Positioning';

export default function Index() {
  const title = 'GNSS Calculator | Positioning Calculator';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <PositioningPage />
    </>
  );
}
