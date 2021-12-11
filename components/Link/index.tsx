/* eslint-disable jsx-a11y/anchor-has-content */
import NextLink from "next/link";
import { Link as MUILink, LinkProps } from "@mui/material";
import { useRouter } from "next/router";

type Props = Omit<LinkProps, "href"> & {
  href: string;
};

export default function Link({ href, ...props }: Props) {
  const { pathname } = useRouter();
  const isActive = pathname === href;

  return (
    <NextLink href={href}>
      <MUILink color="inherit" underline="none" variant="body1" sx={{ cursor: "pointer", borderBottom: "2px solid", borderColor: isActive ? "white" : "transparent" }} {...props} />
    </NextLink>
  );
}
