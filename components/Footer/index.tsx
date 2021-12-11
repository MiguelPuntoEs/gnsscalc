import { makeStyles, Typography } from "@mui/material";
import Image from "next/image";
import Link from "components/Link";
import { Box } from "@mui/system";

type FooterIconProps = {
  href: string;
  src: string;
  alt: string;
};

const FooterIcon = ({ alt, href, src }: FooterIconProps) => (
  <Box
    sx={{
      width: "30px",
      height: "auto",
      margin: ({ spacing }) => spacing(0, 0.1),
    }}
  >
    <a href={href} target="_blank" rel="noreferrer">
      <Image src={src} alt={alt} height="30" width="30" />
    </a>
  </Box>
);

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        background: "#f5f5f5",
        borderTop: "1px solid #ddd",
        borderBottom: "1px solid #ddd",
        padding: "20px 10%",
        zIndex: 1,
        "> ul": {
          flexDirection: {
            xs: "column",
            sm: "row",
          },
        },
        ul: {
          display: "flex",
          justifyContent: "space-between",
          padding: 0,
          margin: 0,
          alignItems: "center",
          listStyleType: "none",

          li: {
            margin: ({ spacing }) => spacing(0.25),
          },
        },
        a: {
          color: "inherit",
          textDecoration: "none",
        },
      }}
    >
      <ul>
        <li>
          <span>Made with ❤️ @</span>
          <a
            href="https://www.varheight.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Typography
              sx={{
                fontWeight: (theme) => theme.typography.fontWeightBold,
                em: {
                  color: "#2996b8",
                  fontStyle: "normal",
                },
              }}
              variant="button"
            >
              <em>var</em>height
            </Typography>
          </a>
        </li>
        <li>
          <ul>
            <li>
              <FooterIcon
                href="https://www.linkedin.com/company/varheight/about/"
                src="/icons/linkedin.svg"
                alt="linkedIn"
              />
            </li>
            <li>
              <FooterIcon
                href="https://twitter.com/varheight"
                src="/icons/twitter.svg"
                alt="twitter"
              />
            </li>
            <li>
              <FooterIcon
                href="https://www.facebook.com/varheight"
                src="/icons/facebook.svg"
                alt="facebook"
              />
            </li>
            <li>
              <FooterIcon
                href="https://www.instagram.com/varheight/"
                src="/icons/instagram.svg"
                alt="Instagram"
              />
            </li>
          </ul>
        </li>
        <li>
          <Link href="/privacy">Privacy Policy</Link>
        </li>
      </ul>
    </Box>
  );
}
