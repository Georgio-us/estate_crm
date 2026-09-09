type LogoMarkProps = {
  className?: string;
  title?: string;
};

export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="estate-mark-shell" x1="35" y1="18" x2="83" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#535B66" />
          <stop offset="1" stopColor="#2B323B" />
        </linearGradient>
        <linearGradient id="estate-mark-letter" x1="22" y1="34" x2="53" y2="83" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E8EAED" />
        </linearGradient>
        <linearGradient id="estate-mark-grid" x1="53" y1="54" x2="69" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#747C87" />
          <stop offset="1" stopColor="#4E5661" />
        </linearGradient>
      </defs>

      <path
        fill="#101318"
        d="M18 4H82C89.732 4 96 10.268 96 18V82C96 89.732 89.732 96 82 96H18C10.268 96 4 89.732 4 82V18C4 10.268 10.268 4 18 4Z"
      />
      <path
        fill="url(#estate-mark-shell)"
        d="M44.45 27.117L75.041 15.385C78.899 13.905 83 16.754 83 20.886V79.4C83 82.493 80.493 85 77.4 85H46.1C43.007 85 40.5 82.493 40.5 79.4V75.1C40.5 72.007 43.007 69.5 46.1 69.5H68V31.517L53.53 37.068C52.889 37.314 52.208 37.44 51.521 37.44H46.45C43.357 37.44 40.85 34.933 40.85 31.84C40.85 29.761 42.51 27.861 44.45 27.117Z"
      />
      <path
        fill="url(#estate-mark-letter)"
        d="M22.6 38H54.4C57.493 38 60 40.507 60 43.6V45.2C60 48.293 57.493 50.8 54.4 50.8H34.4V57.4H44.7C47.793 57.4 50.3 59.907 50.3 63V64.1C50.3 67.193 47.793 69.7 44.7 69.7H34.4V76.2H44.8C47.893 76.2 50.4 78.707 50.4 81.8V85H22.6C19.507 85 17 82.493 17 79.4V43.6C17 40.507 19.507 38 22.6 38Z"
      />
      <path fill="url(#estate-mark-grid)" d="M56.1 55H61.9C63.059 55 64 55.941 64 57.1V62.9C64 64.059 63.059 65 61.9 65H56.1C54.941 65 54 64.059 54 62.9V57.1C54 55.941 54.941 55 56.1 55Z" />
      <path fill="url(#estate-mark-grid)" d="M66.1 55H71.9C73.059 55 74 55.941 74 57.1V62.9C74 64.059 73.059 65 71.9 65H66.1C64.941 65 64 64.059 64 62.9V57.1C64 55.941 64.941 55 66.1 55Z" />
      <path fill="url(#estate-mark-grid)" d="M56.1 65H61.9C63.059 65 64 65.941 64 67.1V72.9C64 74.059 63.059 75 61.9 75H56.1C54.941 75 54 74.059 54 72.9V67.1C54 65.941 54.941 65 56.1 65Z" />
      <path fill="url(#estate-mark-grid)" d="M66.1 65H71.9C73.059 65 74 65.941 74 67.1V72.9C74 74.059 73.059 75 71.9 75H66.1C64.941 75 64 74.059 64 72.9V67.1C64 65.941 64.941 65 66.1 65Z" />
    </svg>
  );
}
