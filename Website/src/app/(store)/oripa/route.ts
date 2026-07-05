const goneHeaders = {
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function GET() {
  return new Response(
    "This retired search alias is gone. Use https://www.ynotopen.com/online-mystery-packs-thailand",
    {
      status: 410,
      headers: goneHeaders,
    },
  );
}

export function HEAD() {
  return new Response(null, {
    status: 410,
    headers: goneHeaders,
  });
}
