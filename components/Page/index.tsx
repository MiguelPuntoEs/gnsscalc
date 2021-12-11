import ApplicationFrame from "components/ApplicationFrame";
import Head from "next/head";

type PageProps = {
  title: string;
};

const Page: React.FC<PageProps> = ({ title, children }) => {
  const pageTitle = `GNSS Calculator | ${title}`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta property="og:title" content={pageTitle} />
        <meta property="twitter:title" content={pageTitle} />
      </Head>
      <ApplicationFrame>{children}</ApplicationFrame>
    </>
  );
};

export default Page;
