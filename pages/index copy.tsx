import Head from 'next/head';

import IndexPage from '../components/pages/Index';

export default function Index() {
  const title = 'GNSS Calculator | GPS Time Calculator';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <IndexPage />
    </>
  );
}
