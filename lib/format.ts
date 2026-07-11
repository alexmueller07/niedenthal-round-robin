// Display helpers for Madison wall-clock dates ("YYYY-MM-DD") and times
// ("HH:MM"). Date objects are constructed from components — never parsed from
// strings — so the browser/server timezone can't shift the day.

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** "Friday, July 17" */
export function formatDate(date: string): string {
  const { y, m, d } = parts(date);
  const day = new Date(y, m - 1, d);
  return `${WEEKDAYS[day.getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Fri, Jul 17" */
export function formatDateShort(date: string): string {
  const { y, m, d } = parts(date);
  const day = new Date(y, m - 1, d);
  return `${WEEKDAYS[day.getDay()].slice(0, 3)}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** "2:30 PM" */
export function formatTime(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mRaw} ${suffix}`;
}

/** "2:30 – 4:30 PM" (drops the first suffix when both match) */
export function formatTimeRange(start: string, end: string): string {
  const a = formatTime(start);
  const b = formatTime(end);
  const [aTime, aSuffix] = a.split(" ");
  const [, bSuffix] = b.split(" ");
  return aSuffix === bSuffix ? `${aTime} – ${b}` : `${a} – ${b}`;
}

/** Today's date in Madison as "YYYY-MM-DD", regardless of server timezone. */
export function todayInMadison(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
