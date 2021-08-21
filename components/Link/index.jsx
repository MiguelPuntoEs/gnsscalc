/* eslint-disable jsx-a11y/anchor-has-content */
import NextLink from 'next/link';

export default function Link({ href, ...props }) {
  return (
    <NextLink href={href}>
      <a {...props} />
    </NextLink>
  );
}
