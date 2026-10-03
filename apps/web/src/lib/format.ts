const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

const whenFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
});

const pad = (value: number) => value.toString().padStart(2, "0");

export const shortAddress = (value: string, size = 4) =>
  value.length <= size * 2 + 1
    ? value
    : `${value.slice(0, size)}…${value.slice(-size)}`;

export const formatWhen = (unixSeconds: number) =>
  whenFormatter.format(new Date(unixSeconds * 1000));

export const formatCountdown = (seconds: number) => {
  const left = Math.max(0, Math.floor(seconds));
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) {
    return `${days}d ${pad(hours)}h`;
  }
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(left % MINUTE)}s`;
  }
  return `${left}s`;
};

export const formatShare = (bps: number) => {
  const percent = bps / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
};
