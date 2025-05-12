import ContactForm from '@/components/ContactForm';
import Head from 'next/head';
import Link from 'next/link';

export default function PrivacyPage() {
  const title = 'GNSS Calculator | Contact';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <>
        <ContactForm />
      </>
    </>
  );
}
