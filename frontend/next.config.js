/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    // Leitet Browser-Requests an /api/* intern an das Backend im Compose-Netzwerk weiter,
    // damit Frontend und Backend aus Cookie-/CORS-Sicht als eine Origin erscheinen.
    return [
      { source: "/api/:path*", destination: `${process.env.BACKEND_INTERNAL_URL || "http://backend:8000"}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
