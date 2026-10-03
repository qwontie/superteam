export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        className="fill-cladd-fg"
        d="M2 6a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v3.5a1.5 1.5 0 0 1-1.5 1.5H12v2H7v-2H3.5A1.5 1.5 0 0 1 2 9.5V6Z"
      />
      <path
        className="fill-pact-money"
        d="M2 14.5A1.5 1.5 0 0 1 3.5 13H6v1.5h7V13h7.5a1.5 1.5 0 0 1 1.5 1.5V18a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-3.5Z"
      />
    </svg>
  );
}
