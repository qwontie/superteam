export interface WalletBrowseLink {
  href: string;
  name: string;
}

const PHONE = /Android|iPhone|iPad|iPod/i;
const IPAD_AS_MAC = /Macintosh/;

export const isPhone = () => {
  if (typeof navigator === "undefined") {
    return false;
  }
  const agent = navigator.userAgent;
  return (
    PHONE.test(agent) ||
    (IPAD_AS_MAC.test(agent) && navigator.maxTouchPoints > 1)
  );
};

export const walletBrowseLinks = (
  url: string,
  origin: string
): WalletBrowseLink[] => {
  const target = encodeURIComponent(url);
  const ref = encodeURIComponent(origin);
  return [
    {
      href: `https://phantom.com/ul/browse/${target}?ref=${ref}`,
      name: "Phantom",
    },
    {
      href: `https://solflare.com/ul/v1/browse/${target}?ref=${ref}`,
      name: "Solflare",
    },
  ];
};
