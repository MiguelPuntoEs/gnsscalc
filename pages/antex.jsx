import Head from 'next/head';
import ANTEXPage from '../components/pages/ANTEX';

export default function Index() {
  const title = 'GNSS Calculator | ANTEX Plotter';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <ANTEXPage />
    </>
  );
}
