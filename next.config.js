const withNextIntl = require('next-intl/plugin')(
  './i18n.ts'
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix for vendor chunk issues with next-intl
  experimental: {
    optimizePackageImports: ['next-intl'],
  },
}

module.exports = withNextIntl(nextConfig)


